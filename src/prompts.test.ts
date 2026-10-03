import { expect, test } from "bun:test";

import { buildChatSystemPrompt } from "./agent/prompts.js";
import type { EnvironmentInfo } from "./agent/environment.js";

test("chat system prompt keeps the routing, spawn-brief, and rules sections", () => {
  const prompt = buildChatSystemPrompt();
  for (const heading of ["# Role", "# Route", "# Rules", "# Spawn"]) {
    expect(prompt).toContain(heading);
  }
  for (const field of [
    "prompt",
    "success_criteria",
    "do_not",
    "report_focus",
  ]) {
    expect(prompt).toContain(field);
  }
  expect(prompt).toContain("manage_tasks");
});

const envBase: EnvironmentInfo = {
  cwd: "/tmp/proj",
  platform: "test",
  arch: "arm64",
  runtime: "Bun 1.4.2",
  date: new Date("2026-01-15T00:00:00Z"),
  isGitRepo: false,
};

test("environment context lists configured MCP servers", () => {
  const prompt = buildChatSystemPrompt(undefined, {
    ...envBase,
    mcpServers: ["linear", "exa"],
  });
  expect(prompt).toContain("MCP: linear, exa");
  expect(prompt).toContain("tool_search");
  expect(prompt).toContain("next turn");
});

test("environment context omits MCP when none are configured", () => {
  const prompt = buildChatSystemPrompt(undefined, envBase);
  expect(prompt).not.toContain("MCP:");
});
