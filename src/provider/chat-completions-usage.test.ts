import { describe, expect, test } from "bun:test";
import type { ProviderAdapter } from "@intx/inference";
import { createOpenAIAdapter } from "@intx/inference/providers";
import type { LastCycleSource } from "@intx/types/runtime";
import { createCompactionGovernor } from "../agent/compaction.js";
import { createOpenAICompatibleAdapter } from "./openai-compatible-adapter.js";
import { createOpenCodeGoAdapter } from "./opencode-go-adapter.js";
import { contextTokensFromUsage } from "./context-window.js";
import { defined } from "../../testkit/defined.js";

const source: LastCycleSource = {
  sourceId: "usage-test",
  provider: "openai-compatible",
  model: "usage-fixture",
};

function usageFrom(events: ReturnType<ProviderAdapter["parseResponse"]>) {
  const event = events.find(
    (candidate) => candidate.type === "inference.usage",
  );
  if (event?.type !== "inference.usage") throw new Error("Missing usage event");
  return event.data.usage;
}

const factories = [
  ["builtin", createOpenAIAdapter],
  ["compatible", createOpenAICompatibleAdapter],
  ["Go", createOpenCodeGoAdapter],
] as const;

describe.each(factories)("%s Chat Completions usage", (_name, factory) => {
  test.each(["usage-only", "choice-bearing", "JSON"])(
    "%s counts cached prompt tokens once",
    (shape) => {
      const adapter = factory(source);
      const wireUsage = {
        prompt_tokens: 50_000,
        completion_tokens: 100,
        prompt_tokens_details: { cached_tokens: 40_000 },
        completion_tokens_details: { reasoning_tokens: 20 },
      };
      const events =
        shape === "JSON"
          ? defined(adapter.parseJSONResponse)(
              JSON.stringify({
                object: "chat.completion",
                choices: [{ message: { content: "done" } }],
                usage: wireUsage,
              }),
            )
          : adapter.parseResponse(
              JSON.stringify({
                choices:
                  shape === "usage-only"
                    ? []
                    : [{ delta: { content: "done" }, finish_reason: "stop" }],
                usage: wireUsage,
              }),
            );
      const usage = usageFrom(events);
      expect(usage).toEqual({
        input: 10_000,
        output: 100,
        cacheRead: 40_000,
        cacheWrite: 0,
        thinking: 20,
      });
      expect(contextTokensFromUsage(usage)).toBe(wireUsage.prompt_tokens);
    },
  );

  test.each([undefined, null, {}, { cached_tokens: 0 }])(
    "keeps all prompt tokens when cache details are %j",
    (details) => {
      const usage = usageFrom(
        factory(source).parseResponse(
          JSON.stringify({
            choices: [],
            usage: { prompt_tokens: 50_000, prompt_tokens_details: details },
          }),
        ),
      );
      expect(usage.input).toBe(50_000);
      expect(usage.cacheRead).toBe(0);
      expect(contextTokensFromUsage(usage)).toBe(50_000);
    },
  );

  test("never reports negative uncached input", () => {
    const usage = usageFrom(
      factory(source).parseResponse(
        JSON.stringify({
          choices: [],
          usage: {
            prompt_tokens: 100,
            prompt_tokens_details: { cached_tokens: 200 },
          },
        }),
      ),
    );
    expect(usage.input).toBe(0);
    expect(usage.cacheRead).toBe(200);
  });
});

test("a cached post-fold prompt below threshold does not pause automatic folds", () => {
  const assistant = {
    role: "assistant" as const,
    model: source.model,
    timestamp: 1,
    content: [{ type: "text" as const, text: "done" }],
  };
  const turns = [
    {
      role: "user" as const,
      timestamp: 0,
      content: [{ type: "text" as const, text: "task" }],
    },
    assistant,
  ];
  const governor = createCompactionGovernor(() => undefined);
  governor.syncFromTurns(turns);
  governor.requestManual("", { turns });
  governor.interceptIdleContinuation(
    { type: "message.received", message: { content: "" } } as Parameters<
      typeof governor.interceptIdleContinuation
    >[0],
    {
      compact: (compactor: string, reason: string) => ({
        type: "compact",
        compactor,
        reason,
      }),
    } as Parameters<typeof governor.interceptIdleContinuation>[1],
  );
  governor.notePostCompact(turns);
  const usage = usageFrom(
    createOpenAICompatibleAdapter(source).parseResponse(
      JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: 50_000,
          prompt_tokens_details: { cached_tokens: 40_000 },
        },
      }),
    ),
  );
  governor.noteInferenceDone(
    { type: "inference.done", turn: assistant, source, usage },
    turns,
  );
  expect(governor.foldNonConverged).toBe(false);
});
