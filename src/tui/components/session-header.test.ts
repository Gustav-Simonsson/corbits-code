import { describe, expect, test } from "bun:test";
import { composeSessionHeader } from "./session-header.js";

describe("composeSessionHeader", () => {
  test("wordmark alone when no essentials apply", () => {
    expect(composeSessionHeader()).toBe("corbits code");
    expect(composeSessionHeader({})).toBe("corbits code");
    expect(composeSessionHeader({ essentials: "" })).toBe("corbits code");
  });

  test("wordmark leads the quiet essentials line", () => {
    expect(
      composeSessionHeader({ essentials: "thegreataxios · muse-spark" }),
    ).toBe("corbits code · thegreataxios · muse-spark");
    expect(
      composeSessionHeader({
        essentials: "thegreataxios · muse-spark · yolo",
      }),
    ).toBe("corbits code · thegreataxios · muse-spark · yolo");
  });
});
