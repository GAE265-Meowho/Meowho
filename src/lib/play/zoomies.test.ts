import { describe, expect, it } from "vitest";
import { nextZoom, rayHit, topUnder, ZOOM_JUMP_P, zoomRest, type Top } from "./zoomies";

const bed: Top = { id: "bed", x: 2, z: 2, w: 1.4, d: 2, top: 0.5 };
const desk: Top = { id: "desk", x: 2.5, z: 2.5, w: 1, d: 0.6, top: 0.75 };

describe("topUnder", () => {
  it("點在檯面範圍內（扣掉邊緣）才算在檯面上", () => {
    expect(topUnder(2, 2, [bed])?.id).toBe("bed");
    expect(topUnder(2 + 0.69, 2, [bed])).toBeNull();  // 太靠邊
    expect(topUnder(0, 0, [bed])).toBeNull();
  });
  it("重疊時取最高的檯面", () => {
    expect(topUnder(2.5, 2.5, [bed, desk])?.id).toBe("desk");
  });
});

describe("rayHit", () => {
  it("從上往下看床，先打到床面（有高度）", () => {
    const h = rayHit([2, 3, 2], [0, -1, 0], [bed]);
    expect(h?.on?.id).toBe("bed");
    expect(h?.y).toBeCloseTo(0.5);
  });
  it("床旁邊的地板打到地板", () => {
    const h = rayHit([0, 3, 0], [0, -1, 0], [bed]);
    expect(h?.on).toBeNull();
    expect(h?.y).toBe(0);
  });
  it("斜看時沿著射線算落點", () => {
    const h = rayHit([0, 1, 2], [1, -1, 0], [bed]);
    // 在 y=0.5 時 x=0.5，不在床上；打到地板 x=1
    expect(h?.on).toBeNull();
    expect(h?.x).toBeCloseTo(1);
  });
  it("往上看打不到", () => {
    expect(rayHit([0, 1, 0], [0, 1, 0], [bed])).toBeNull();
  });
});

describe("nextZoom", () => {
  it("在家具上就跳下來", () => {
    expect(nextZoom(true, [bed]).kind).toBe("down");
  });
  it("亂數小於機率時跳上家具，否則繼續跑", () => {
    expect(nextZoom(false, [bed, desk], () => ZOOM_JUMP_P / 2)).toMatchObject({ kind: "jump" });
    expect(nextZoom(false, [bed], () => 0.9)).toEqual({ kind: "run" });
  });
  it("沒有可以跳的家具就一直跑", () => {
    expect(nextZoom(false, [], () => 0)).toEqual({ kind: "run" });
  });
});

describe("zoomRest", () => {
  it("地板上幾乎不停、家具上待久一點", () => {
    expect(zoomRest(false, () => 1)).toBeLessThan(zoomRest(true, () => 0));
  });
});
