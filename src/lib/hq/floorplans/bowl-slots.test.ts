import { describe, expect, it } from "vitest";
import { bowlSlotsFromSamples, isWaterColor, type ColorSample } from "./bowl-slots";

const grid = (water: (x: number) => boolean): ColorSample[] => {
  const out: ColorSample[] = [];
  for (let x = -0.24; x <= 0.24; x += 0.04) for (let z = -0.12; z <= 0.12; z += 0.04) {
    out.push({ x, z, rgb: water(x) && Math.abs(z) < 0.07 ? [0.55, 0.78, 0.86] : x < -0.06 && Math.abs(z) < 0.07 ? [0.45, 0.3, 0.2] : [0.9, 0.5, 0.45] });
  }
  return out;
};

describe("餐碗組的碗位置（#304）", () => {
  it("淺藍算水；咖啡色飼料、珊瑚色碗墊、白色碗緣不算", () => {
    expect(isWaterColor([0.55, 0.78, 0.86])).toBe(true);
    expect(isWaterColor([0.45, 0.3, 0.2])).toBe(false);
    expect(isWaterColor([0.9, 0.5, 0.45])).toBe(false);
    expect(isWaterColor([0.95, 0.95, 0.95])).toBe(false);
  });
  it("水在右邊 → 水碗在右、飼料碗在左（沿長邊對稱）", () => {
    const s = bowlSlotsFromSamples(grid(x => x > 0.06), [0, 0], [0.52, 0.34])!;
    expect(s.water[0]).toBeGreaterThan(0.1);
    expect(s.food[0]).toBeCloseTo(-s.water[0]);
    expect(s.food[1]).toBeCloseTo(s.water[1]);
  });
  it("水在左邊也認得", () => {
    const s = bowlSlotsFromSamples(grid(x => x < -0.06), [0, 0], [0.52, 0.34])!;
    expect(s.water[0]).toBeLessThan(-0.1);
    expect(s.food[0]).toBeGreaterThan(0.1);
  });
  it("長邊是 Z 時沿 Z 對稱", () => {
    const samples = grid(x => x > 0.06).map(p => ({ ...p, x: p.z, z: p.x }));
    const s = bowlSlotsFromSamples(samples, [0, 0], [0.34, 0.52])!;
    expect(s.water[1]).toBeGreaterThan(0.1);
    expect(s.food[1]).toBeCloseTo(-s.water[1]);
  });
  it("找不到水或水在正中間 → null（改用預設）", () => {
    expect(bowlSlotsFromSamples(grid(() => false), [0, 0], [0.52, 0.34])).toBeNull();
    expect(bowlSlotsFromSamples(grid(x => Math.abs(x) < 0.05), [0, 0], [0.52, 0.34])).toBeNull();
  });
});
