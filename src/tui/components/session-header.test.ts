import { describe, expect, test } from "bun:test";
import { LOCKUP_WORDMARK } from "../lockup.js";
import { ESSENTIALS_SEPARATOR } from "./prompt-action-bar-label.js";
import { composeSessionHeader } from "./session-header.js";

describe("composeSessionHeader", () => {
  test("wordmark alone when no essentials apply", () => {
    expect(composeSessionHeader()).toBe(LOCKUP_WORDMARK);
    expect(composeSessionHeader({})).toBe(LOCKUP_WORDMARK);
    expect(composeSessionHeader({ essentials: "" })).toBe(LOCKUP_WORDMARK);
  });

  test("wordmark leads the quiet essentials line", () => {
    expect(composeSessionHeader({ essentials: "profile · model" })).toBe(
      `${LOCKUP_WORDMARK}${ESSENTIALS_SEPARATOR}profile · model`,
    );
    expect(composeSessionHeader({ essentials: "profile · model · yolo" })).toBe(
      `${LOCKUP_WORDMARK}${ESSENTIALS_SEPARATOR}profile · model · yolo`,
    );
  });
});
