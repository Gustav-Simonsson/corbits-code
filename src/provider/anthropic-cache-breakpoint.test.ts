import { describe, expect, test } from "bun:test";
import { createAnthropicAdapter } from "@intx/inference/providers";
import type {
  ConversationTurn,
  InferenceOptions,
} from "@intx/types/runtime";

const source = {
  sourceId: "test-anthropic",
  provider: "anthropic",
  model: "test-anthropic-model",
};

function userTurn(text: string): ConversationTurn {
  return {
    role: "user",
    timestamp: 0,
    content: [{ type: "text", text }],
  };
}

function assistantTurn(text: string): ConversationTurn {
  return {
    role: "assistant",
    timestamp: 0,
    content: [{ type: "text", text }],
  };
}

type WireMessage = {
  role: string;
  content: { cache_control?: unknown; text?: string }[];
};

function wireMessages(body: string): WireMessage[] {
  return (JSON.parse(body) as { messages: WireMessage[] }).messages;
}

describe("anthropic cache breakpoint with ephemeral turns", () => {
  test("breakpoint lands on the last persisted user turn, not the ephemeral tail", () => {
    const persisted = [userTurn("q1"), assistantTurn("a1"), userTurn("q2")];
    const nudge = userTurn("wrap up soon");
    const request = createAnthropicAdapter(source).buildRequest(
      [...persisted, nudge],
      "test-anthropic-model",
      { ephemeralTurns: [nudge] } as InferenceOptions,
    );
    const messages = wireMessages(request.body);

    expect(messages).toHaveLength(4);
    expect(messages[3]?.content[0]?.text).toBe("wrap up soon");
    expect(
      messages[2]?.content[messages[2].content.length - 1]?.cache_control,
    ).toEqual({ type: "ephemeral" });
    expect(
      messages[3]?.content.filter((block) => block.cache_control !== undefined),
    ).toEqual([]);
  });
});
