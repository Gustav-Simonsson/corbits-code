import { describe, test, expect } from "bun:test";
import { hostQuirks } from "./openai-responses.js";

describe("OpenCode Go Responses quirks", () => {
  // Muse Spark batches independent tool calls into one turn by default — three
  // reads in a single response. Sending parallel_tool_calls: false collapses
  // that to one call per turn and triples the turn count on a bounded task.
  // Leaving the quirk unset is what keeps the gateway default. See CL-7869.
  test("leaves parallel_tool_calls unset so the gateway default stands", () => {
    expect(hostQuirks.parallelToolCalls).toBeUndefined();
  });
});
