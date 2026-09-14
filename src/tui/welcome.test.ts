import { describe, expect, test } from "bun:test";

import { MARK_LARGE, MARK_MID, MARK_SMALL } from "./mark-shape.js";
import { createHarness } from "./harness.js";
import { stringWidth } from "./view/height.js";
import {
  resolveWelcomeLine,
  resolveWelcomeMarkGrid,
  runWelcome,
  WELCOME_LINE,
} from "./welcome.js";

describe("resolveWelcomeMarkGrid", () => {
  test("picks the largest mark that fits the terminal", () => {
    expect(resolveWelcomeMarkGrid(24, 80)).toBe(MARK_LARGE);
    expect(resolveWelcomeMarkGrid(14, 80)).toBe(MARK_MID);
    expect(resolveWelcomeMarkGrid(10, 40)).toBe(MARK_SMALL);
    expect(resolveWelcomeMarkGrid(4, 80)).toBeNull();
  });
});

describe("runWelcome", () => {
  test("continues on Enter keypress", async () => {
    const harness = await createHarness({ width: 80, height: 30 });
    const done = runWelcome({
      createRenderer: async () => harness.renderer,
      autoAdvanceMs: 60_000,
      now: () => 2_000,
    });
    try {
      await harness.renderOnce();
      harness.pressKey("Enter");
      await expect(done).resolves.toBe(true);
    } finally {
      // If the assertion failed before Enter, cancel so timers cannot leak.
      harness.pressKey("Ctrl+C");
      await Promise.race([done, new Promise((r) => setTimeout(r, 50))]);
      harness.destroy();
    }
  });

  test("cancels on Ctrl+C without continuing", async () => {
    const harness = await createHarness({ width: 80, height: 30 });
    const done = runWelcome({
      createRenderer: async () => harness.renderer,
      autoAdvanceMs: 60_000,
      now: () => 2_000,
    });
    try {
      await harness.renderOnce();
      harness.pressKey("Ctrl+C");
      await expect(done).resolves.toBe(false);
    } finally {
      harness.destroy();
    }
  });

  test("auto-advances when the timer fires", async () => {
    const harness = await createHarness({ width: 80, height: 30 });
    const done = runWelcome({
      createRenderer: async () => harness.renderer,
      autoAdvanceMs: 20,
      now: () => 2_000,
    });
    try {
      await expect(done).resolves.toBe(true);
    } finally {
      harness.destroy();
    }
  });
});

describe("resolveWelcomeLine", () => {
  test("returns the full line or nothing, never a fragment", () => {
    const fullWidth = stringWidth(WELCOME_LINE);
    for (let columns = 0; columns < fullWidth; columns += 1) {
      expect(resolveWelcomeLine(columns)).toBe("");
    }
    expect(resolveWelcomeLine(fullWidth)).toBe(WELCOME_LINE);
    expect(resolveWelcomeLine(fullWidth + 40)).toBe(WELCOME_LINE);
  });
});

describe("runWelcome hold and cancel", () => {
  test("cancels on Ctrl+D without continuing", async () => {
    const harness = await createHarness({ width: 80, height: 30 });
    const done = runWelcome({
      createRenderer: async () => harness.renderer,
      autoAdvanceMs: 60_000,
      now: () => 2_000,
    });
    try {
      await harness.renderOnce();
      harness.pressKey("d", { ctrl: true });
      await expect(done).resolves.toBe(false);
    } finally {
      harness.destroy();
    }
  });

  test("narrow terminals do not paint a sliced factory sentence", async () => {
    const harness = await createHarness({ width: 42, height: 30 });
    const done = runWelcome({
      createRenderer: async () => harness.renderer,
      autoAdvanceMs: 60_000,
      now: () => 2_000,
    });
    try {
      await harness.renderOnce();
      await harness.renderOnce();
      const frame = harness.captureCharFrame();
      expect(frame).not.toContain(WELCOME_LINE);
      const words = WELCOME_LINE.split(/[^A-Za-z]+/).filter(
        (word) => word.length >= 6,
      );
      expect(words.length).toBeGreaterThan(0);
      for (const word of words) {
        expect(frame).not.toContain(word);
      }
    } finally {
      harness.pressKey("Ctrl+C");
      await Promise.race([done, new Promise((r) => setTimeout(r, 50))]);
      harness.destroy();
    }
  });
});
