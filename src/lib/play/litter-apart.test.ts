import { describe, expect, it } from "vitest";
import { APART_M, litterApart } from "./litter-apart";

describe("擺用品時砂盆和碗是不是已經分開", () => {
  it("有位置就看距離", () => {
    expect(litterApart({ bowl: { x: 0, z: 0 }, litter: { x: APART_M + 0.1, z: 0 } })).toBe(true);
    expect(litterApart({ bowl: { x: 0, z: 0 }, litter: { x: 0.5, z: 0.3 } })).toBe(false);
  });
  it("快速位置：不同地方算分開、同一個地方不算", () => {
    expect(litterApart({ bowlSpot: "床旁", litterSpot: "房間角落" })).toBe(true);
    expect(litterApart({ bowlSpot: "床旁", litterSpot: "床旁" })).toBe(false);
  });
  it("判斷不出來（一件自己擺、一件快速位置）就照舊問玩家", () => {
    expect(litterApart({ bowl: { x: 0, z: 0 }, bowlSpot: "自己擺的位置", litterSpot: "床旁", freeSpot: "自己擺的位置" })).toBe(false);
    expect(litterApart({})).toBe(false);
  });
});
