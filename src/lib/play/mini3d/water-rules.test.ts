import { describe, expect, it } from "vitest";
import { careGood } from "@/lib/play/care";
import { pourWater, waterHint, waterResult, WATER_GOAL } from "./water-rules";

describe("3D 換水規則", () => {
  it("水龍頭沒開就沒有水進來", () => {
    expect(pourWater(10, 0.05, false)).toBe(10);
  });

  it("倒到 70 以上才算換好水，結果格式照 careGood", () => {
    let fill = 0;
    for (let i = 0; i < 30; i++) fill = pourWater(fill, 0.05, true); // 1.5 秒
    expect(fill).toBeLessThan(WATER_GOAL);
    expect(careGood("water", waterResult(fill))).toBe(false);
    for (let i = 0; i < 5; i++) fill = pourWater(fill, 0.05, true);
    expect(careGood("water", waterResult(fill))).toBe(true);
  });

  it("一次跳很久也只算 0.1 秒；倒過頭回報最多 100", () => {
    expect(pourWater(0, 60, true)).toBeCloseTo(4.5);
    let fill = 0;
    for (let i = 0; i < 100; i++) fill = pourWater(fill, 0.1, true);
    expect(waterResult(fill)).toEqual({ fill: 100 });
    expect(waterHint(fill, true)).toContain("太滿");
  });
});
