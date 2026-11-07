// 虛擬飼養 DEMO（#237）：玩家背景＝喵戶的 home 欄位；缺欄位時補範例值
import { describe, expect, it } from "vitest";
import { normalizeHome, SAMPLE_HOME, homeSummary } from "./background";

describe("normalizeHome（喵戶 home → 玩家背景）", () => {
  it("沒登入或沒喵戶（null）：整份用範例背景", () => {
    expect(normalizeHome(null)).toEqual(SAMPLE_HOME);
    expect(normalizeHome(undefined).sample).toBe(true);
    expect(normalizeHome("壞資料").sample).toBe(true);
  });

  it("完整資料：代碼轉成中文，選「其他」時用補充文字", () => {
    const h = normalizeHome({ dwelling: "apartment", living: "own", family: ["小孩", "其他"], familyOther: "外婆", pets: ["狗"], petsOther: "" });
    expect(h).toEqual({ dwelling: "公寓", living: "自有", family: ["小孩", "外婆"], pets: ["狗"], sample: false });
  });

  it("缺欄位：住家型態、住家狀況、同住的人、現有寵物各自補範例值", () => {
    const h = normalizeHome({ dwelling: "house" });
    expect(h.dwelling).toBe("透天");
    expect(h.living).toBe(SAMPLE_HOME.living);
    expect(h.family).toEqual(SAMPLE_HOME.family);
    expect(h.pets).toEqual(SAMPLE_HOME.pets);
    expect(h.sample).toBe(false);
  });

  it("表單的「自己住」「沒有」是選項不是人和寵物：一個人住＝同住的人空陣列，沒有寵物＝空陣列，劇情才不會出現「自己住笑著說」「家裡的沒有」", () => {
    const h = normalizeHome({ dwelling: "apartment", living: "rent", family: ["自己住"], pets: ["沒有"] });
    expect(h.family).toEqual([]);
    expect(h.pets).toEqual([]);
    expect(homeSummary(h)).toContain("一個人住");
    expect(homeSummary(h)).toContain("沒有其他寵物");
  });
  it("「其他」沒填內容時家人寫成「家人」，有填就用填的；寵物同理", () => {
    expect(normalizeHome({ dwelling: "apartment", family: ["其他"], familyOther: "", pets: [] }).family).toEqual(["家人"]);
    expect(normalizeHome({ dwelling: "apartment", family: ["其他"], familyOther: "表姊", pets: [] }).family).toEqual(["表姊"]);
    expect(normalizeHome({ dwelling: "apartment", family: [], pets: ["其他動物"], petsOther: "" }).pets).toEqual(["小動物"]);
  });
  it("自己住和其他同住的人同時勾時只留其他人", () => {
    expect(normalizeHome({ dwelling: "apartment", family: ["自己住", "小孩"], pets: [] }).family).toEqual(["小孩"]);
  });

  it("空陣列是有效回答（一個人住、沒有寵物），不補範例；不認得的代碼丟掉", () => {
    const h = normalizeHome({ dwelling: "castle", living: null, family: [], pets: ["恐龍", "貓"] });
    expect(h.dwelling).toBe(SAMPLE_HOME.dwelling);
    expect(h.living).toBe(SAMPLE_HOME.living);
    expect(h.family).toEqual([]);
    expect(h.pets).toEqual(["貓"]);
  });

  it("全部欄位都是空的：視為範例背景", () => {
    expect(normalizeHome({ dwelling: null, living: null }).sample).toBe(true);
  });

  it("補充文字過長會截斷，避免整段送進 AI", () => {
    const h = normalizeHome({ dwelling: "other", dwellingOther: "x".repeat(80), living: "rent", family: [], pets: [] });
    expect(h.dwelling.length).toBeLessThanOrEqual(30);
  });

  it("homeSummary：一行文字給畫面和 AI 用", () => {
    expect(homeSummary({ dwelling: "公寓", living: "租屋", family: [], pets: [], sample: false })).toBe("公寓・租屋・一個人住・沒有其他寵物");
    expect(homeSummary({ dwelling: "透天", living: "自有", family: ["小孩"], pets: ["狗"], sample: false })).toBe("透天・自有・和小孩同住・家裡有狗");
  });
});
