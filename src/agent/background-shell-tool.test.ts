import { defined } from "../../testkit/defined.js";
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/** Poll until no process carries `token`; fail instead of asserting on a pid. */
async function waitUntilGone(token: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const probe = spawnSync("pgrep", ["-f", token], { encoding: "utf8" });
    if ((probe.stdout?.trim() ?? "").length === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`tagged child still alive after 5s: ${token}`);
}
import { createPermissionGate } from "../permission/gate.js";
import { createAgentToolset } from "./tools.js";
import type { BackgroundShellExit } from "../shell/background-shell.js";
import { buildShellBackgroundMessage } from "../session/runtime-assembly.js";
import { OPERATOR_ORIGINATED_FLAG } from "../agent/message-provenance.js";

function gate(cwd: string) {
  return createPermissionGate({
    approvals: [],
    interactive: false,
    skipPermissions: true,
    reactorGated: false,
    cwd,
  });
}

describe("background shell through the agent toolset", () => {
  test("run_shell background:true returns a handle and delivers the exit on exit", async () => {
    const exits: BackgroundShellExit[] = [];
    const toolset = await createAgentToolset({
      cwd: process.cwd(),
      permissionGate: gate(process.cwd()),
      onOperatorGate: async () => ({ kind: "cancel" as const }),
      onBackgroundShellExit: (exit) => exits.push(exit),
    });
    try {
      const started = await toolset.dynamicRunner.run(
        {
          id: "bg-start",
          name: "run_shell",
          arguments: { command: "sleep 0.2; echo bg-done", background: true },
        },
        new AbortController().signal,
      );
      expect(started.isError).not.toBe(true);
      const parsed = JSON.parse(String(started.content)) as {
        shell_id: string;
      };
      const deadline = Date.now() + 5_000;
      while (exits.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(exits).toHaveLength(1);
      expect(defined(exits[0]).id).toBe(parsed.shell_id);
      const message = buildShellBackgroundMessage(defined(exits[0]));
      expect(message.headers.messageId).toBe(
        `bg-shell-${parsed.shell_id}@local`,
      );
      expect(message.ref.mailbox).toBe("system");
      expect(message.flags).not.toContain(OPERATOR_ORIGINATED_FLAG);
      expect(message.content).toContain("exit code 0");
      expect(message.content).toContain("bg-done");
    } finally {
      await toolset.dispose();
    }
  });

  test("run_shell stop kills the session's own child process group", async () => {
    const token = `ic_toolset_cancel_${randomUUID()}`;
    const toolset = await createAgentToolset({
      cwd: process.cwd(),
      permissionGate: gate(process.cwd()),
      onOperatorGate: async () => ({ kind: "cancel" as const }),
    });
    try {
      const started = await toolset.dynamicRunner.run(
        {
          id: "c-start",
          name: "run_shell",
          arguments: {
            command: `sleep 600 # ${token}`,
            background: true,
          },
        },
        new AbortController().signal,
      );
      const { shell_id } = JSON.parse(String(started.content)) as {
        shell_id: string;
      };
      const stopped = await toolset.dynamicRunner.run(
        { id: "c-stop", name: "run_shell", arguments: { stop: shell_id } },
        new AbortController().signal,
      );
      expect(JSON.parse(String(stopped.content))).toMatchObject({
        status: "cancelling",
      });
      await waitUntilGone(token);
    } finally {
      await toolset.dispose();
    }
  });

  test("run_shell stop on an unknown id is an error", async () => {
    const toolset = await createAgentToolset({
      cwd: process.cwd(),
      permissionGate: gate(process.cwd()),
      onOperatorGate: async () => ({ kind: "cancel" as const }),
    });
    try {
      const out = await toolset.dynamicRunner.run(
        { id: "u-stop", name: "run_shell", arguments: { stop: "nope" } },
        new AbortController().signal,
      );
      expect(out.isError).toBe(true);
    } finally {
      await toolset.dispose();
    }
  });

  test("toolset dispose kills every live background process group", async () => {
    const token = `ic_toolset_dispose_${randomUUID()}`;
    const toolset = await createAgentToolset({
      cwd: process.cwd(),
      permissionGate: gate(process.cwd()),
      onOperatorGate: async () => ({ kind: "cancel" as const }),
    });
    const started = await toolset.dynamicRunner.run(
      {
        id: "d-start",
        name: "run_shell",
        arguments: { command: `sleep 600 # ${token}`, background: true },
      },
      new AbortController().signal,
    );
    expect(started.isError).not.toBe(true);
    await toolset.dispose();
    await waitUntilGone(token);
  });
});
