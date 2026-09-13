import { describe, expect, test } from "bun:test";
import type { Agent, SendResult } from "@intx/agent";
import type {
  ApprovalSnapshot,
  ConversationTurn,
  InboundMessage,
} from "@intx/types/runtime";

import { APPROVAL_TIMEOUT_RESULT_TEXT } from "../permission/decline-markers.js";
import type { PermissionGate } from "../permission/gate.js";
import { createApprovalResume } from "./approval-resume.js";

function assistantTurn(
  calls: { id: string; name: string; command: string }[],
): ConversationTurn {
  return {
    role: "assistant",
    content: calls.map((call) => ({
      type: "tool_call" as const,
      id: call.id,
      name: call.name,
      arguments: { command: call.command },
    })),
    timestamp: 1,
  };
}

function timeoutTurn(callId: string): ConversationTurn {
  return {
    role: "user",
    content: [
      {
        type: "tool_result" as const,
        callId,
        content: [
          { type: "text" as const, text: APPROVAL_TIMEOUT_RESULT_TEXT },
        ],
        isError: true,
      },
    ],
    timestamp: 2,
  };
}

function suspension(
  correlationId: string,
  command: string,
): Extract<SendResult, { type: "suspended" }> {
  const snapshot: ApprovalSnapshot = {
    name: "run_shell",
    description: "run a shell command",
    inputSchema: {},
    arguments: { command },
  };
  return { type: "suspended", correlationId, approvalSnapshot: snapshot };
}

function setup(args: {
  preTurns: ConversationTurn[];
  onGate: (turns: ConversationTurn[]) => void;
  resolveParkedCallId?: (correlationId: string) => string | undefined;
}) {
  const turns: ConversationTurn[] = [...args.preTurns];
  const delivered: InboundMessage[] = [];
  const agent = {
    history: async () => turns,
    deliver: (message: InboundMessage) => {
      delivered.push(message);
    },
  };
  const gate = {
    resolveSuspended: async () => {
      args.onGate(turns);
      return { allow: true };
    },
  } as unknown as PermissionGate;
  const resume = createApprovalResume({
    getAgent: () => agent as Pick<Agent, "deliver" | "history">,
    gate,
    ...(args.resolveParkedCallId !== undefined
      ? { resolveParkedCallId: args.resolveParkedCallId }
      : {}),
  });
  return { resume, delivered };
}

function decisionBody(message: InboundMessage): { outcome: string } {
  if (message.content === undefined)
    throw new Error("expected a decision body");
  return JSON.parse(message.content) as { outcome: string };
}

function deliveredCorrelationId(message: InboundMessage): string {
  const correlationId = message.headers.interchangeCorrelationId;
  if (correlationId === undefined)
    throw new Error("expected an interchange correlation id");
  return correlationId;
}

describe("approval-resume parallel-parked approvals", () => {
  test("delivers A's decision when a different parked call's approval times out", async () => {
    const { resume, delivered } = setup({
      preTurns: [
        assistantTurn([
          { id: "call-A", name: "run_shell", command: "echo alpha" },
          { id: "call-B", name: "run_shell", command: "echo bravo" },
        ]),
      ],
      onGate: (turns) => {
        turns.push(timeoutTurn("call-B"));
      },
    });

    const handled = await resume.handle(suspension("corr-A", "echo alpha"));

    expect(handled).toBe(true);
    expect(delivered).toHaveLength(1);
    const message = delivered[0];
    if (message === undefined) throw new Error("expected a delivered decision");
    expect(deliveredCorrelationId(message)).toBe("corr-A");
    expect(decisionBody(message).outcome).toBe("approved");
  });

  test("still drops a genuinely late decision for the same parked call", async () => {
    const { resume, delivered } = setup({
      preTurns: [
        assistantTurn([
          { id: "call-A", name: "run_shell", command: "echo alpha" },
          { id: "call-B", name: "run_shell", command: "echo bravo" },
        ]),
      ],
      onGate: (turns) => {
        turns.push(timeoutTurn("call-A"));
      },
    });

    const handled = await resume.handle(suspension("corr-A", "echo alpha"));

    expect(handled).toBe(true);
    expect(delivered).toHaveLength(0);
  });

  test("pending-operation lookup identifies the parked call without history tool calls", async () => {
    const { resume, delivered } = setup({
      preTurns: [
        {
          role: "user",
          content: [{ type: "text" as const, text: "run two shell commands" }],
          timestamp: 1,
        },
      ],
      onGate: (turns) => {
        turns.push(timeoutTurn("call-B"));
      },
      resolveParkedCallId: (correlationId) =>
        correlationId === "corr-A" ? "call-A" : undefined,
    });

    const handled = await resume.handle(suspension("corr-A", "echo alpha"));

    expect(handled).toBe(true);
    expect(delivered).toHaveLength(1);
    const message = delivered[0];
    if (message === undefined) throw new Error("expected a delivered decision");
    expect(deliveredCorrelationId(message)).toBe("corr-A");
    expect(decisionBody(message).outcome).toBe("approved");
  });
});
