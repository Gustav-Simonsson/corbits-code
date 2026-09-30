import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { stringTool } from "@intx/agent";
import type { AgentTool } from "@intx/agent";
import type { ToolDefinition } from "@intx/types/runtime";
import { type } from "arktype";

import {
  applyUpdateHunks,
  CodexApplyPatchError,
  parseCodexApplyPatch,
  type PatchOp,
} from "./codex-apply-patch.js";

export const applyPatchDefinition: ToolDefinition = {
  name: "apply_patch",
  description:
    "Edit files with a patch envelope: *** Begin Patch, then *** Add File: / *** Update File: (optional *** Move to:) / *** Delete File: sections, then *** End Patch. Update hunks start with @@ and use ' ', '-', '+' line prefixes. Paths are workspace-relative.",
  inputSchema: {
    type: "object",
    properties: {
      input: { type: "string", description: "The full patch envelope" },
    },
    required: ["input"],
  },
};

const ApplyPatchArgs = type({ input: "string" });

type Planned =
  | { kind: "write"; path: string; content: string; label: string }
  | { kind: "remove"; path: string; label: string };

function contained(cwd: string, path: string): string {
  const abs = resolve(cwd, path);
  const rel = relative(cwd, abs);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new CodexApplyPatchError(`path escapes the workspace: ${path}`);
  }
  return abs;
}

async function plan(cwd: string, op: PatchOp): Promise<Planned[]> {
  if (op.type === "add") {
    const path = contained(cwd, op.path);
    return [
      { kind: "write", path, content: op.content, label: `A ${op.path}` },
    ];
  }
  if (op.type === "delete") {
    return [
      { kind: "remove", path: contained(cwd, op.path), label: `D ${op.path}` },
    ];
  }
  const source = contained(cwd, op.path);
  let original: string;
  try {
    original = await readFile(source, "utf8");
  } catch {
    throw new CodexApplyPatchError(`cannot read ${op.path} to update it`);
  }
  const content = applyUpdateHunks(original, op.hunks);
  if (op.moveTo === undefined) {
    return [{ kind: "write", path: source, content, label: `M ${op.path}` }];
  }
  return [
    {
      kind: "write",
      path: contained(cwd, op.moveTo),
      content,
      label: `M ${op.moveTo}`,
    },
    { kind: "remove", path: source, label: "" },
  ];
}

/**
 * Plans every op before touching disk so a bad hunk in the last file cannot
 * leave the earlier files half-patched.
 */
export function createApplyPatchTool(cwd: string): AgentTool {
  return stringTool({
    definition: applyPatchDefinition,
    handler: async (rawArgs: Record<string, unknown>): Promise<string> => {
      const parsedArgs = ApplyPatchArgs(rawArgs);
      if (parsedArgs instanceof type.errors) {
        return "Error: apply_patch requires input (string).";
      }
      try {
        const patch = parseCodexApplyPatch(parsedArgs.input);
        const steps: Planned[] = [];
        for (const op of patch.ops) steps.push(...(await plan(cwd, op)));
        for (const step of steps) {
          if (step.kind === "write") {
            await mkdir(dirname(step.path), { recursive: true });
            await writeFile(step.path, step.content);
          } else {
            await rm(step.path, { force: true });
          }
        }
        const labels = steps.map((s) => s.label).filter((l) => l !== "");
        return `Success. Updated the following files:\n${labels.join("\n")}`;
      } catch (err) {
        if (err instanceof CodexApplyPatchError) return `Error: ${err.message}`;
        throw err;
      }
    },
  });
}
