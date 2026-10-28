import { describe, it, expect } from "vitest";
import { parseQuery, matchCats, adoptList } from "./match";
import { CATS } from "./mock-data";

describe("parseQuery（對應 UT-07-01、UT-07-02）", () => {
  it("解析縣市、成貓、新手、親人", () => {
    const p = parseQuery("我住台中北屯，第一次養，想要親人的成貓");
    expect(p.city).toBe("台中市");
    expect(p.adult).toBe(true);
    expect(p.novice).toBe(true);
    expect(p.gentle).toBe(true);
  });
  it("沒提縣市時 city 為 null", () => {
    expect(parseQuery("想要獨立一點的貓").city).toBeNull();
  });
});

describe("matchCats（對應 UT-07-03）", () => {
  it("同縣市範圍只回傳該縣市的貓", () => {
    const r = matchCats(CATS, "我住台中，第一次養", "city", "台中市");
    expect(r.results.every(x => x.cat.city === "台中市")).toBe(true);
  });
  it("新手友善的貓排在前面", () => {
    const r = matchCats(CATS, "台中，第一次養，想要親人的成貓", "city", "台中市");
    expect(r.results[0].cat.novice).toBe(true);
  });
});

describe("adoptList（對應 UT-07-05）", () => {
  it("等最久的貓排第一", () => {
    const list = adoptList(CATS, "台中市");
    const days = list.map(c => c.waitDays);
    expect(days).toEqual([...days].sort((a, b) => b - a));
  });
});
