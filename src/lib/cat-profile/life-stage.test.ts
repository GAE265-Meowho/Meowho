import { describe, expect, it } from "vitest";
import { BODY_TYPE_OF, LIFE_STAGES, ageLabel, approxAge, bodyTypeOf, lifeStageFromWords, lifeStageOf } from "./life-stage";

describe("年齡層（幼貓／成貓／老貓三級，#109、#206）", () => {
  it("依月齡分級：幼貓未滿 7 個月、成貓 7 個月到未滿 10 歲、老貓 10 歲以上", () => {
    expect(lifeStageOf(0)).toBe("kitten");
    expect(lifeStageOf(6)).toBe("kitten");
    expect(lifeStageOf(7)).toBe("adult");
    expect(lifeStageOf(12)).toBe("adult");
    expect(lifeStageOf(96)).toBe("adult");
    expect(lifeStageOf(119)).toBe("adult");
    expect(lifeStageOf(120)).toBe("senior");
    expect(lifeStageOf(200)).toBe("senior");
  });
  it("月齡未知回傳 null", () => {
    expect(lifeStageOf(null)).toBeNull();
  });
  it("只有三級，名稱就是 3D 體型名稱", () => {
    expect(LIFE_STAGES.map((s) => s.label)).toEqual(["幼貓", "成貓", "老貓"]);
  });
  it("「剛滿月」「小貓」「成貓」「老貓」這類說法直接對應", () => {
    expect(lifeStageFromWords("剛滿月的小橘")).toBe("kitten");
    expect(lifeStageFromWords("還是小貓")).toBe("kitten");
    expect(lifeStageFromWords("已經是成貓了")).toBe("adult");
    expect(lifeStageFromWords("是隻老貓")).toBe("senior");
    expect(lifeStageFromWords("牠很親人")).toBeNull();
  });
});

describe("3D 體型由年齡層推出", () => {
  it("三級直接對應三種體型", () => {
    expect(bodyTypeOf("kitten")).toBe("kitten");
    expect(bodyTypeOf("adult")).toBe("adult");
    expect(bodyTypeOf("senior")).toBe("senior");
  });
  it("每一級年齡層都有對應體型", () => {
    for (const s of LIFE_STAGES) expect(BODY_TYPE_OF[s.id]).toBeDefined();
  });
});

describe("名片上的大約年紀（#206）", () => {
  it("未滿 1 歲用月、滿 1 歲用歲", () => {
    expect(approxAge(3)).toBe("約 3 個月");
    expect(approxAge(0)).toBe("約 1 個月");
    expect(approxAge(30)).toBe("約 2 歲");
    expect(approxAge(null)).toBeNull();
  });
  it("年齡層加上大約年紀；沒有月齡只顯示年齡層", () => {
    expect(ageLabel("kitten", 3)).toBe("幼貓（約 3 個月）");
    expect(ageLabel("adult", null)).toBe("成貓");
    expect(ageLabel(null, null)).toBe("");
  });
});
