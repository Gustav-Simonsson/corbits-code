import { type } from "arktype";
import { readdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { stringTool } from "@intx/agent";
import type { AgentTool } from "@intx/agent";
import type { ToolDefinition } from "@intx/types/runtime";
import { resolveWorkspacePath } from "../permission/path-restriction.js";
import type { RootsProvider } from "../permission/worktree-roots.js";

const ListDirArgs = type({ "path?": "string" });

export const listDirDefinition: ToolDefinition = {
  name: "list_dir",
  description:
    "List the entries of a directory in the workspace. Use this instead of shelling out to ls or find when you just need to see what a directory contains.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Directory path relative to the workspace root. Defaults to the root.",
      },
    },
    required: [],
  },
};

const MAX_ENTRIES = 200;

export interface ListDirectoryOptions {
  // When true (--dangerously-skip-permissions / yolo), list paths outside the
  // workspace. A getter is resolved per call so `/yolo` mid-session takes
  // effect without rebuilding the tool.
  allowOutside?: boolean | (() => boolean);
  // Workspace roots beyond cwd (the session's registered git worktrees).
  // Defaults to cwd alone.
  rootsProvider?: RootsProvider;
}

function resolveAllowOutside(
  value: boolean | (() => boolean) | undefined,
): boolean {
  if (typeof value === "function") return value();
  return value === true;
}

export async function listDirectory(
  cwd: string,
  path: string,
  options: ListDirectoryOptions = {},
): Promise<string> {
  const allowOutside = resolveAllowOutside(options.allowOutside);
  const rel = path.length > 0 ? path : ".";
  const rootsProvider = options.rootsProvider ?? (() => []);

  // Containment is delegated to the shared workspace resolver: it realpaths
  // the session root before comparing (so an aliased cwd such as macOS
  // /tmp -> /private/tmp never false-denies) and admits registered sibling
  // worktree roots. The canonical path feeds readdir directly, so a symlink
  // retargeted after the check cannot redirect the read.
  let realAbs: string;
  if (allowOutside) {
    try {
      realAbs = await realpath(resolve(cwd, rel));
    } catch (err) {
      return `Error: cannot list ${rel}: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    const resolved = resolveWorkspacePath(cwd, rel, rootsProvider);
    if (resolved === undefined) {
      return `Error: ${rel} is outside the workspace.`;
    }
    realAbs = resolved;
  }

  let entries;
  try {
    entries = await readdir(realAbs, { withFileTypes: true });
  } catch (err) {
    return `Error: cannot list ${rel}: ${err instanceof Error ? err.message : String(err)}`;
  }

  const names = entries
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort();
  if (names.length === 0) return `(empty directory) ${rel}`;

  const shown = names.slice(0, MAX_ENTRIES);
  const remaining = names.length - shown.length;
  return (
    shown.join("\n") + (remaining > 0 ? `\n… (${remaining} more entries)` : "")
  );
}

export function createListDirTool(
  cwd: string,
  options: ListDirectoryOptions = {},
): AgentTool {
  return stringTool({
    definition: listDirDefinition,
    handler: async (rawArgs: Record<string, unknown>): Promise<string> => {
      const parsed = ListDirArgs(rawArgs);
      if (parsed instanceof type.errors) {
        return "Error: list_dir requires path (string) if provided.";
      }
      const path = parsed.path ?? "";
      return listDirectory(cwd, path, options);
    },
  });
}
