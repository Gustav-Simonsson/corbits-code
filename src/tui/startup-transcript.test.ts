/**
 * CL-7938: consecutive duplicate system echoes collapse instead of painting
 * twice, and a deferred session header flushes first when the landing clears.
 */
import { describe, expect, test } from "bun:test";
import { withTestRenderer } from "./harness";
import { appendStreamRow } from "./shell/chrome";
import { createAppShell } from "./shell/index";
import { isLanding } from "./shell/internals";
import { surfaceSystemNotice } from "./shell/prompt";
import { streamRowCount } from "./shell/transcript";

const OPTIONS = {
  terminal: { columns: 80, rows: 24 },
  wireKeys: false,
};

describe("startup transcript", () => {
  test("consecutive duplicate system rows paint once", async () => {
    await withTestRenderer(async (h) => {
      const shell = createAppShell(h.renderer, OPTIONS);
      try {
        appendStreamRow(shell, {
          role: "system",
          text: "Chose muse-spark.",
          meta: "model picker",
        });
        appendStreamRow(shell, {
          role: "system",
          text: "Chose muse-spark.",
          meta: "model picker",
        });
        expect(streamRowCount(shell)).toBe(1);
        expect(shell.streamLog.map((row) => row.text)).toEqual([
          "Chose muse-spark.",
        ]);
      } finally {
        shell.dispose();
      }
    });
  });

  test("three identical system rows in a row paint once", async () => {
    await withTestRenderer(async (h) => {
      const shell = createAppShell(h.renderer, OPTIONS);
      try {
        for (let i = 0; i < 3; i += 1) {
          appendStreamRow(shell, {
            role: "system",
            text: "Chose muse-spark.",
            meta: "model picker",
          });
        }
        expect(streamRowCount(shell)).toBe(1);
        expect(shell.streamLog.map((row) => row.text)).toEqual([
          "Chose muse-spark.",
        ]);
      } finally {
        shell.dispose();
      }
    });
  });

  test("separated repeats and other roles still paint", async () => {
    await withTestRenderer(async (h) => {
      const shell = createAppShell(h.renderer, OPTIONS);
      try {
        appendStreamRow(shell, { role: "system", text: "Chose muse-spark." });
        appendStreamRow(shell, { role: "user", text: "hi" });
        appendStreamRow(shell, { role: "system", text: "Chose muse-spark." });
        appendStreamRow(shell, { role: "system", text: "Chose muse-spark." });
        appendStreamRow(shell, { role: "tool", text: "Chose muse-spark." });
        expect(shell.streamLog.map((row) => row.text)).toEqual([
          "Chose muse-spark.",
          "hi",
          "Chose muse-spark.",
          "Chose muse-spark.",
        ]);
      } finally {
        shell.dispose();
      }
    });
  });

  test("a deferred session header flushes first when the landing clears", async () => {
    await withTestRenderer(async (h) => {
      const shell = createAppShell(h.renderer, { ...OPTIONS, run: "idle" });
      try {
        expect(isLanding(shell)).toBe(true);
        surfaceSystemNotice(
          shell,
          "corbits code · thegreataxios · muse-spark · yolo",
        );
        surfaceSystemNotice(
          shell,
          "Permission prompts are disabled by your saved default (/yolo off to re-enable).",
        );
        expect(streamRowCount(shell)).toBe(0);
        appendStreamRow(shell, { role: "user", text: "first prompt" });
        expect(shell.streamLog.map((row) => row.text)).toEqual([
          "corbits code · thegreataxios · muse-spark · yolo",
          "Permission prompts are disabled by your saved default (/yolo off to re-enable).",
          "first prompt",
        ]);
      } finally {
        shell.dispose();
      }
    });
  });
});
