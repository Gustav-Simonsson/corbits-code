import { expect, test } from "bun:test";

import { buildChatSystemPrompt } from "./agent/prompts.js";

test("chat system prompt keeps the routing, spawn-brief, and rules sections", () => {
  const prompt = buildChatSystemPrompt();
  for (const heading of ["# Role", "# Route", "# Rules", "# Spawn"]) {
    expect(prompt).toContain(heading);
  }
  for (const field of ["goal", "success_criteria", "do_not", "report_focus"]) {
    expect(prompt).toContain(field);
  }
  expect(prompt).toContain("manage_tasks");
});
