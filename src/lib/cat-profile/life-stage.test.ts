import { describe, expect, it } from "vitest";
import { BODY_TYPE_OF, LIFE_STAGES, bodyTypeOf, lifeStageOf } from "./life-stage";

describe("年齡層（AAFP／AAHA 四級）", () => {
  it("依月齡分級，分界在 12、84、120 個月", () => {
    expect(lifeStageOf(0)).toBe("kitten");
    expect(lifeStageOf(11)).toBe("kitten");
    expect(lifeStageOf(12)).toBe("young_adult");
    expect(lifeStageOf(83)).toBe("young_adult");
    expect(lifeStageOf(84)).toBe("mature_adult");
    expect(lifeStageOf(119)).toBe("mature_adult");
    expect(lifeStageOf(120)).toBe("senior");
    expect(lifeStageOf(200)).toBe("senior");
  });
  it("月齡未知回傳 null", () => {
    expect(lifeStageOf(null)).toBeNull();
  });
  it("四級都有中文名稱", () => {
    expect(LIFE_STAGES.map((s) => s.label)).toEqual(["幼貓", "年輕成貓", "成熟成貓", "老貓"]);
  });
});

describe("3D 體型由年齡層推出", () => {
  it("年輕成貓、成熟成貓都用壯貓體型", () => {
    expect(bodyTypeOf("kitten")).toBe("kitten");
    expect(bodyTypeOf("young_adult")).toBe("adult");
    expect(bodyTypeOf("mature_adult")).toBe("adult");
    expect(bodyTypeOf("senior")).toBe("senior");
  });
  it("每一級年齡層都有對應體型", () => {
    for (const s of LIFE_STAGES) expect(BODY_TYPE_OF[s.id]).toBeDefined();
  });
});
