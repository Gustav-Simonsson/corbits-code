/**
 * Settings-pin live-apply (CL-8993): cycling the theme pin repaints the shell
 * at once — it never records-and-waits-for-relaunch. Pins resolve exactly as
 * startup does; explicit pins are deterministic regardless of terminal state,
 * so these tests never touch `process.env` or spawn an OS probe.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { setTheme, UI } from "../theme.js";
import { applyThemePinLive } from "./settings.js";

afterEach(() => {
  setTheme("corbits-dark");
});

describe("applyThemePinLive", () => {
  test("a dark pin swaps the shared UI binding and repaints", () => {
    let repaints = 0;
    const applied = applyThemePinLive("dark", () => {
      repaints += 1;
    });
    expect(applied).toBe("corbits-dark");
    expect(UI.name).toBe("corbits-dark");
    expect(repaints).toBe(1);
  });

  test("a light pin swaps the shared UI binding and repaints", () => {
    setTheme("corbits-dark");
    const darkGround = UI.ground;
    let repaints = 0;
    const applied = applyThemePinLive("light", () => {
      repaints += 1;
    });
    expect(applied).toBe("corbits-light");
    expect(UI.name).toBe("corbits-light");
    expect(UI.ground).not.toBe(darkGround);
    expect(repaints).toBe(1);
  });

  test("auto re-resolves through the startup path and repaints", () => {
    let repaints = 0;
    const applied = applyThemePinLive("auto", () => {
      repaints += 1;
    });
    expect(["corbits-dark", "corbits-light"]).toContain(applied);
    expect(UI.name).toBe(applied);
    expect(repaints).toBe(1);
  });
});
