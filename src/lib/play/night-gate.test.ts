import { describe, expect, it } from "vitest";
import { dashStillOn, isNightSfx, setNightSfx } from "./night-gate";

describe("跑酷聲音只在晚上（#456 渝茜）", () => {
  it("衝刺聲：換場、天亮、離開劇情節點就該切斷", () => {
    expect(dashStillOn("node", "zoom", true)).toBe(true);
    expect(dashStillOn("node", "zoom", false)).toBe(false);
    expect(dashStillOn("node", "sit", true)).toBe(false);
    expect(dashStillOn("report", "zoom", true)).toBe(false);
  });
  it("夜晚旗標可設可讀", () => {
    setNightSfx(true);
    expect(isNightSfx()).toBe(true);
    setNightSfx(false);
    expect(isNightSfx()).toBe(false);
  });
});
