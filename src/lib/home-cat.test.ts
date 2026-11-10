import { describe, expect, it } from "vitest";
import { journeyClip } from "./home-cat";

describe("journeyClip", () => {
  const still = { moving: false, sleep: false, sit: false, eat: false };
  it("走動時播走路，停下來照各區塊的動作", () => {
    expect(journeyClip({ ...still, moving: true, sleep: true })).toBe("walk");
    expect(journeyClip({ ...still, sleep: true })).toBe("sleep");
    expect(journeyClip({ ...still, eat: true })).toBe("eat");
    expect(journeyClip({ ...still, sit: true })).toBe("sit");
    expect(journeyClip(still)).toBe("idle");
  });
});
