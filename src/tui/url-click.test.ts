/**
 * URL click-through (CL-7346): Ctrl+click opens an http(s) URL in the
 * default browser; a plain click keeps today's row behavior.
 *
 * The opener is mocked (setUrlOpener) — no test spawns a real browser.
 * Whether a real terminal reports the Ctrl modifier is a harness blind
 * spot (docs/TUI.md); headless, the mock delivers it like any click.
 */
import { describe, expect, test } from "bun:test";
import { TextRenderable } from "@opentui/core";

import { defined } from "../../tests/helpers/defined.js";
import { withTestRenderer } from "./harness";
import { appendStreamRow, replaceStreamRowAt } from "./shell/chrome";
import { createAppShell } from "./shell/index";
import {
  isUnderlined,
  paintLinkLine,
  resetUrlOpener,
  setUrlOpener,
  splitLinkSpans,
} from "./url-links";
import { type StreamRow } from "./stream";

const CALL: StreamRow = {
  role: "tool",
  text: "",
  meta: "web_fetch",
  verb: "Web Fetch",
  summary: "see https://www.example.com/docs for details",
  detail: [[{ text: "url: https://www.example.com/docs", fg: "#f7ead5" }]],
};

/** Screen position of the first cell of `needle`, or null when not painted. */
function findCell(
  frame: string,
  needle: string,
): { readonly x: number; readonly y: number } | null {
  const lines = frame.split("\n");
  for (const [y, line] of lines.entries()) {
    const x = line.indexOf(needle);
    if (x !== -1) return { x, y };
  }
  return null;
}

describe("Ctrl+clicking a transcript URL", () => {
  test("opens it, while plain click and Ctrl+drag do not", async () => {
    await withTestRenderer(
      async (h) => {
        const shell = createAppShell(h.renderer, {
          terminal: { columns: 80, rows: 24 },
          wireKeys: false,
          run: "idle",
        });
        const opened: string[] = [];
        setUrlOpener((url) => {
          opened.push(url);
        });
        try {
          appendStreamRow(shell, CALL);
          await h.renderOnce();

          const link = findCell(h.captureCharFrame(), "example.com");
          expect(link).not.toBeNull();
          const at = defined(link);

          await h.mockMouse.click(at.x, at.y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual(["https://www.example.com/docs"]);

          opened.length = 0;
          await h.mockMouse.click(at.x, at.y);
          await h.renderOnce();
          expect(opened).toEqual([]);
          expect(shell.streamLog[0]?.expanded).not.toBe(true);

          await h.mockMouse.drag(at.x, at.y, at.x + 12, at.y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual([]);
        } finally {
          resetUrlOpener();
          shell.dispose();
        }
      },
      { width: 80, height: 24 },
    );
  });

  test("Ctrl+hover underlines the link until the pointer leaves it", async () => {
    await withTestRenderer(
      async (h) => {
        const shell = createAppShell(h.renderer, {
          terminal: { columns: 80, rows: 24 },
          wireKeys: false,
          run: "idle",
        });
        try {
          appendStreamRow(shell, CALL);
          await h.renderOnce();

          const link = findCell(h.captureCharFrame(), "example.com");
          expect(link).not.toBeNull();
          const at = defined(link);

          const linkSpanUnderlined = (): boolean =>
            defined(h.captureSpans().lines[at.y]).spans.some(
              (span) =>
                span.text.includes("example.com") &&
                isUnderlined(span.attributes),
            );

          await h.mockMouse.moveTo(at.x, at.y, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(linkSpanUnderlined()).toBe(true);

          await h.mockMouse.moveTo(at.x, at.y);
          await h.renderOnce();
          expect(linkSpanUnderlined()).toBe(false);
        } finally {
          shell.dispose();
        }
      },
      { width: 80, height: 24 },
    );
  });

  test("retexting the URL away disarms the node: old columns open nothing", async () => {
    await withTestRenderer(
      async (h) => {
        const opened: string[] = [];
        setUrlOpener((url) => {
          opened.push(url);
        });
        try {
          const line = "see https://example.com/x ok";
          const node = new TextRenderable(h.renderer, { content: line });
          h.root.add(node);
          paintLinkLine(node, [splitLinkSpans([{ text: line, fg: "#fff" }])]);
          await h.renderOnce();

          const link = findCell(h.captureCharFrame(), "example.com");
          expect(link).not.toBeNull();
          const at = defined(link);

          await h.mockMouse.click(at.x, at.y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual(["https://example.com/x"]);

          // Retext the URL away, exactly as the row retext path does. The
          // handlers are setter-only (no getter to assert on), so pin the
          // disarm behaviorally: the old columns open nothing and hover
          // leaves the painted text intact.
          const retexted = "see nothing here";
          paintLinkLine(node, [
            splitLinkSpans([{ text: retexted, fg: "#fff" }]),
          ]);
          await h.renderOnce();
          const frame = h.captureCharFrame();
          expect(frame).toContain("nothing here");
          expect(frame).not.toContain("example.com");

          opened.length = 0;
          await h.mockMouse.click(at.x, at.y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual([]);

          const before = h.captureCharFrame();
          await h.mockMouse.moveTo(at.x, at.y, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(h.captureCharFrame()).toBe(before);
        } finally {
          resetUrlOpener();
        }
      },
      { width: 80, height: 24 },
    );
  });

  test("retexting a plain row's URL away through the row path disarms it", async () => {
    await withTestRenderer(
      async (h) => {
        const shell = createAppShell(h.renderer, {
          terminal: { columns: 80, rows: 24 },
          wireKeys: false,
          run: "idle",
        });
        const opened: string[] = [];
        setUrlOpener((url) => {
          opened.push(url);
        });
        try {
          // A user row paints literal text through paintPlainRowNode, so the
          // arm and the later disarm both run on the production row path.
          appendStreamRow(shell, {
            role: "user",
            text: "see https://example.com/x ok",
          });
          await h.renderOnce();

          const link = findCell(h.captureCharFrame(), "example.com");
          expect(link).not.toBeNull();
          const at = defined(link);

          await h.mockMouse.click(at.x, at.y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual(["https://example.com/x"]);

          // Retext in place through replaceStreamRowAt -> retextStreamRow ->
          // paintPlainRowNode's URL-free branch. Reverting that branch's
          // disarm must fail this test (stale handlers survive on the node).
          replaceStreamRowAt(shell, 0, {
            role: "user",
            text: "see nothing here",
          });
          await h.renderOnce();
          const frame = h.captureCharFrame();
          expect(frame).toContain("nothing here");
          expect(frame).not.toContain("example.com");

          opened.length = 0;
          await h.mockMouse.click(at.x, at.y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual([]);

          const before = h.captureCharFrame();
          await h.mockMouse.moveTo(at.x, at.y, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(h.captureCharFrame()).toBe(before);
        } finally {
          resetUrlOpener();
          shell.dispose();
        }
      },
      { width: 80, height: 24 },
    );
  });

  test("a wrapped URL in a thinking row opens the full target", async () => {
    await withTestRenderer(
      async (h) => {
        const shell = createAppShell(h.renderer, {
          terminal: { columns: 40, rows: 24 },
          wireKeys: false,
          run: "idle",
        });
        const opened: string[] = [];
        setUrlOpener((url) => {
          opened.push(url);
        });
        try {
          // Agent thinking paints through the same plain-row path as user
          // rows; the long URL wraps mid-run at this width. Before the fix
          // the row armed the first fragment as its own truncated target.
          const full =
            "https://example.com/abcdefghijklmnopqrstuvwxyz0123456789";
          appendStreamRow(shell, {
            role: "system",
            meta: "thinking",
            text: `checking ${full} today`,
          });
          await h.renderOnce();

          const link = findCell(h.captureCharFrame(), "example.com");
          expect(link).not.toBeNull();
          const at = defined(link);

          await h.mockMouse.click(at.x, at.y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual([full]);
        } finally {
          resetUrlOpener();
          shell.dispose();
        }
      },
      { width: 40, height: 24 },
    );
  });

  test("a URL wrapped across bubble lines opens the full target", async () => {
    await withTestRenderer(
      async (h) => {
        const shell = createAppShell(h.renderer, {
          terminal: { columns: 40, rows: 24 },
          wireKeys: false,
          run: "idle",
        });
        const opened: string[] = [];
        setUrlOpener((url) => {
          opened.push(url);
        });
        try {
          // The bubble body is narrower than the terminal, so the long URL
          // wraps across continuation rows. Every fragment must resolve to
          // the one target, not to its own truncated text.
          const full =
            "https://example.com/abcdefghijklmnopqrstuvwxyz0123456789";
          appendStreamRow(shell, {
            role: "user",
            text: `see ${full} ok`,
          });
          await h.renderOnce();

          const link = findCell(h.captureCharFrame(), "example.com");
          expect(link).not.toBeNull();
          const at = defined(link);

          await h.mockMouse.click(at.x, at.y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual([full]);
        } finally {
          resetUrlOpener();
          shell.dispose();
        }
      },
      { width: 40, height: 24 },
    );
  });

  test("assistant markdown links stay terminal business (no opener call)", async () => {
    await withTestRenderer(
      async (h) => {
        const shell = createAppShell(h.renderer, {
          terminal: { columns: 80, rows: 24 },
          wireKeys: false,
          run: "idle",
        });
        const opened: string[] = [];
        setUrlOpener((url) => {
          opened.push(url);
        });
        try {
          // Markdown prose paints through childless library renderers with
          // no text-leaf API to arm or hit-test (docs/TUI.md), so neither
          // the bare URL nor the explicit link label opens through us.
          // The real terminal owns those cells; this pins that remainder.
          appendStreamRow(shell, {
            role: "assistant",
            text: "see https://example.com/docs and [guide](https://example.com/guide) ok",
          });
          // Assistant rows are markdown; their blocks highlight
          // asynchronously (see shell.test.ts), so the frame only carries
          // the prose after a settle.
          await new Promise((resolve) => setTimeout(resolve, 250));
          await h.renderOnce();

          const bare = findCell(h.captureCharFrame(), "example.com/docs");
          expect(bare).not.toBeNull();
          await h.mockMouse.click(defined(bare).x, defined(bare).y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual([]);

          const label = findCell(h.captureCharFrame(), "guide");
          expect(label).not.toBeNull();
          await h.mockMouse.click(defined(label).x, defined(label).y, 0, {
            modifiers: { ctrl: true },
          });
          await h.renderOnce();
          expect(opened).toEqual([]);
        } finally {
          resetUrlOpener();
          shell.dispose();
        }
      },
      { width: 80, height: 24 },
    );
  });
});
