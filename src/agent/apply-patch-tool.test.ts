import { mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

import { createApplyPatchTool } from "./apply-patch-tool.js";

async function run(cwd: string, input: string): Promise<string> {
  const tool = createApplyPatchTool(cwd);
  if (tool.kind !== "string") throw new Error("expected a string tool");
  return tool.handler({ input }, new AbortController().signal);
}

test("adds, updates, and deletes files in one envelope", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "apply-patch-"));
  await writeFile(join(cwd, "a.txt"), "one\ntwo\nthree\n");
  await writeFile(join(cwd, "gone.txt"), "x\n");
  const out = await run(
    cwd,
    [
      "*** Begin Patch",
      "*** Add File: sub/new.txt",
      "+hello",
      "*** Update File: a.txt",
      "@@",
      " one",
      "-two",
      "+2",
      " three",
      "*** Delete File: gone.txt",
      "*** End Patch",
    ].join("\n"),
  );
  expect(out).toContain("Success");
  expect(await readFile(join(cwd, "sub/new.txt"), "utf8")).toBe("hello\n");
  expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("one\n2\nthree\n");
  await expect(stat(join(cwd, "gone.txt"))).rejects.toThrow();
});

test("a failing hunk leaves every file untouched", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "apply-patch-"));
  await writeFile(join(cwd, "a.txt"), "one\n");
  const out = await run(
    cwd,
    [
      "*** Begin Patch",
      "*** Add File: b.txt",
      "+b",
      "*** Update File: missing.txt",
      "@@",
      "-x",
      "+y",
      "*** End Patch",
    ].join("\n"),
  );
  expect(out).toContain("Error");
  await expect(stat(join(cwd, "b.txt"))).rejects.toThrow();
});

test("rejects paths that escape the workspace", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "apply-patch-"));
  const out = await run(
    cwd,
    "*** Begin Patch\n*** Add File: ../escape.txt\n+x\n*** End Patch",
  );
  expect(out).toContain("escapes the workspace");
});
