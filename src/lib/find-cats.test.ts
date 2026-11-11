import { describe, expect, it } from "vitest";
import {
  toHomeProfile, catText, conditionLabels, cosine, emptyConditions, excludeReason, keywordConditions, mergeConditions, queryText, rankCats, ruleReason, textHash,
  type FindCatRow, type FindConditions, type HomeProfile,
} from "./find-cats";

const today = new Date("2026-11-09T00:00:00Z");
let n = 0;
const cat = (over: Partial<FindCatRow> = {}): FindCatRow => {
  const { coat, ...rest } = over;
  return {
    id: `c${++n}`, name: "橘子", sex: "male", life_stage: "adult", personality_tags: ["親人"], health_tags: [], medical: null,
    description: null, timeline: [], photo_url: null, created_at: "2026-11-01T00:00:00Z", habits: [], compat: null, personality_scale: null, intro: null,
    household: { id: "h1", name: "中途", city: "桃園市", district: "龍潭區", intro: "", caretaker_type: "personal_foster" },
    ...rest,
    coat: coat ?? null,
  };
};
const cond = (over: Partial<FindConditions> = {}): FindConditions => ({ ...emptyConditions(), ...over });
const home: HomeProfile = { city: "台北市", district: "大安區", dwelling: "電梯大樓", family: ["伴侶", "小孩"], pets: ["貓"], firstCat: false };

describe("合併條件：那句話優先，喵戶補空缺", () => {
  it("喵戶補上縣市、小孩、已經有貓，並標出來源", () => {
    const m = mergeConditions(cond({ away: true }), home);
    expect(m.conditions).toMatchObject({ city: "台北市", kids: true, cats: true, dogs: null, away: true });
    expect(m.sources).toEqual({ away: "query", city: "home", kids: "home", cats: "home" });
  });
  it("那句話說的縣市不會被喵戶蓋掉", () => {
    const m = mergeConditions(cond({ city: "台中市" }), home);
    expect(m.conditions.city).toBe("台中市");
    expect(m.sources.city).toBe("query");
  });
  it("讀喵戶資料：住家型態轉文字，沒養過貓＝第一次養貓，並補進條件", () => {
    const h = toHomeProfile({ city: "新北市", district: "板橋區", home: { dwelling: "building", family: ["自己住"], pets: ["沒有"], experience: "none" } });
    expect(h).toEqual({ city: "新北市", district: "板橋區", dwelling: "電梯大樓", family: ["自己住"], pets: ["沒有"], firstCat: true });
    expect(mergeConditions(cond(), h).sources.novice).toBe("home");
    expect(toHomeProfile({ city: null, district: null, home: null }).family).toEqual([]);
  });
  it("沒有喵戶就只用那句話", () => {
    expect(mergeConditions(cond({ kids: true }), null).conditions.city).toBeNull();
  });
  it("條件標籤分兩組；沒有縣市或選全台時顯示全台", () => {
    const m = mergeConditions(cond({ away: true }), home);
    expect(conditionLabels(m, "city")).toEqual({ query: ["白天常不在家"], home: ["台北市", "家裡有小孩", "家裡已經有貓"] });
    expect(conditionLabels(m, "all").query[0]).toBe("全台");
    expect(conditionLabels(mergeConditions(cond(), null), "city").query).toEqual(["全台"]);
  });
});

describe("排除明顯不適合的貓", () => {
  it("有小孩、已有貓、有狗：排除「不行」的，「看情況」「沒遇過」不排除", () => {
    expect(excludeReason(cat({ compat: { kids: "no" } }), cond({ kids: true }))).toBe("kids");
    expect(excludeReason(cat({ compat: { kids: "maybe" } }), cond({ kids: true }))).toBeNull();
    expect(excludeReason(cat({ compat: { cats: "no" } }), cond({ cats: true }))).toBe("cats");
    expect(excludeReason(cat({ compat: { dogs: "no" } }), cond({ dogs: true }))).toBe("dogs");
    expect(excludeReason(cat({ compat: { dogs: "no" } }), cond())).toBeNull();
  });
  it("不考慮特殊需求：排除有身體狀況或 FIV／FeLV 陽性的；願意照顧就不排除", () => {
    expect(excludeReason(cat({ health_tags: ["慢性腎病"] }), cond({ special: "no" }))).toBe("special");
    expect(excludeReason(cat({ medical: { fivFelv: "fiv_positive" } }), cond({ special: "no" }))).toBe("special");
    expect(excludeReason(cat({ health_tags: ["慢性腎病"] }), cond({ special: "yes" }))).toBeNull();
  });
  it("指定年齡層只留那一層", () => {
    expect(excludeReason(cat({ life_stage: "kitten" }), cond({ stage: "adult" }))).toBe("stage");
  });
});

describe("排序", () => {
  const near = cat({ id: "near" });
  const far = cat({ id: "far", created_at: "2026-10-01T00:00:00Z" });
  const taipei = cat({ id: "tp", household: { ...near.household!, city: "台北市" } });
  const vectors = new Map([["near", [1, 0]], ["far", [0, 1]], ["tp", [0.9, 0.1]]]);
  it("同縣市只留那個縣市；全台全部都留", () => {
    const r = rankCats([near, far, taipei], cond({ city: "台北市" }), { scope: "city", queryVec: [1, 0], vectors, today });
    expect(r.results.map(x => x.row.id)).toEqual(["tp"]);
    expect(rankCats([near, far, taipei], cond({ city: "台北市" }), { scope: "all", queryVec: [1, 0], vectors, today }).results).toHaveLength(3);
  });
  it("依意思相近程度排序；沒有縣市時自動改全台", () => {
    const r = rankCats([far, near, taipei], cond(), { scope: "city", queryVec: [1, 0], vectors, today });
    expect(r.scope).toBe("all");
    expect(r.results.map(x => x.row.id)).toEqual(["near", "tp", "far"]);
  });
  it("沒有座標的貓排在最後；同分依等待天數", () => {
    const r = rankCats([near, far], cond(), { scope: "all", queryVec: [1, 0], vectors: new Map(), today });
    expect(r.results.map(x => x.row.id)).toEqual(["far", "near"]);
  });
  it("AI 沒回應時用關鍵字分數排", () => {
    const quiet = cat({ id: "quiet", personality_tags: ["獨立"] });
    const r = rankCats([near, quiet], keywordConditions("上班族，白天不在家，想要獨立一點的貓"), { scope: "all", queryVec: null, vectors, today });
    expect(r.results[0].row.id).toBe("quiet");
  });
  it("結果帶貓卡資料（照片、名字、年齡層、地區、標籤）", () => {
    const r = rankCats([near], cond(), { scope: "all", queryVec: null, vectors, today });
    expect(r.results[0].cat).toMatchObject({ id: "near", name: "橘子", stage: "成貓", district: "桃園市龍潭區", tags: ["親人"] });
  });
});

describe("意思座標用的文字", () => {
  it("貓的介紹文字只有公開內容；內容不變雜湊就不變", () => {
    const c = cat({ personality_tags: ["獨立", "慵懶"], compat: { kids: "yes" }, description: "很愛曬太陽。", medical: { neutered: "done" }, personality_scale: { energy: 1 } });
    const t = catText(c);
    expect(t).toContain("個性：獨立、慵懶");
    expect(t).toContain("可以和小孩相處");
    expect(t).toContain("活動量很懶");
    expect(t).toContain("很愛曬太陽");
    expect(t).not.toContain("結紮");
    expect(textHash(t)).toBe(textHash(catText(c)));
    expect(textHash(t)).not.toBe(textHash(catText({ ...c, description: "改了" })));
  });
  it("查詢文字：想要什麼樣的貓＋家裡的情況", () => {
    const t = queryText(cond({ wish: "安靜的貓", kids: true, away: true }), home);
    expect(t).toContain("想找的貓：安靜的貓");
    expect(t).toContain("家裡有小孩");
    expect(t).toContain("住在電梯大樓");
  });
  it("cosine：方向相同是 1、垂直是 0、長度不同是 0", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1], [1, 2])).toBe(0);
  });
});

describe("關鍵字備案", () => {
  it("讀出縣市、年齡層、小孩、狗、特殊需求、白天不在家", () => {
    expect(keywordConditions("住台中，家裡有小孩和狗，想要幼貓，白天上班")).toMatchObject({ city: "台中市", stage: "kitten", kids: true, dogs: true, away: true });
    expect(keywordConditions("可以照顧需要特別照護的貓").special).toBe("yes");
  });
  it("推薦理由用對得上的條件組一句", () => {
    expect(ruleReason(cat({ name: "豆花", personality_tags: ["獨立"], compat: { kids: "yes" } }), cond({ kids: true, away: true })))
      .toBe("豆花獨立，和小孩處得來、自己在家也自在，可以點進去看看牠的故事。");
  });
});
