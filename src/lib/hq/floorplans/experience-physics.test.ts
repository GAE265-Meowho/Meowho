import { describe, expect, it } from "vitest";
import { boxToSolid, clampFurniturePose, rotatedHalfExtents } from "./experience-physics";

describe("experience-physics", () => {
  it("rotatedHalfExtents：0°／90° 對調寬深", () => {
    expect(rotatedHalfExtents(2, 1, 0)).toEqual({ hx: 1, hz: 0.5 });
    expect(rotatedHalfExtents(2, 1, 90)).toEqual({ hx: 0.5, hz: 1 });
  });

  it("clampFurniturePose：壓回房間內", () => {
    const half = { hx: 0.5, hz: 0.5 };
    expect(clampFurniturePose({ x: -1, z: 10 }, half, [4, 3], [])).toEqual({ x: 0.55, z: 2.45 });
  });

  it("clampFurniturePose：與其他落地家具重疊時推開", () => {
    const half = { hx: 0.5, hz: 0.5 };
    const out = clampFurniturePose(
      { x: 1.2, z: 1 }, half, [6, 6],
      [{ x: 1, z: 1, hx: 0.5, hz: 0.5 }],
    );
    expect(Math.abs(out.x - 1) >= 0.999 || Math.abs(out.z - 1) >= 0.999).toBe(true);
  });

  it("clampFurniturePose：撞牆時推離牆段（不可穿牆）", () => {
    const half = { hx: 0.4, hz: 0.4 };
    // 房間左側牆：中心 x=0.05、厚 0.1、沿 z 長 4（rotY=π/2 → 厚在 x）
    const wall = boxToSolid({ x: 0.05, z: 2, sx: 4, sz: 0.1, rotY: Math.PI / 2 });
    expect(wall.hx).toBeCloseTo(0.05, 5);
    const out = clampFurniturePose({ x: 0.2, z: 2 }, half, [4, 4], [wall], { inset: 0.02 });
    // 家具左緣不可進入牆：中心 ≥ wall.x + wall.hx + half.hx
    expect(out.x).toBeGreaterThanOrEqual(0.05 + wall.hx + half.hx - 0.001);
  });

  it("onSupport 時呼叫端可不傳家具障礙；仍可被牆推開", () => {
    const half = { hx: 0.3, hz: 0.3 };
    const wall = { x: 0.05, z: 1, hx: 0.05, hz: 2 };
    const out = clampFurniturePose({ x: 0.2, z: 1 }, half, [6, 6], [wall], { inset: 0.02 });
    expect(out.x).toBeGreaterThanOrEqual(0.05 + 0.05 + 0.3 - 0.001);
  });
});
