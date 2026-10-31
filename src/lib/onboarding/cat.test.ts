import { describe, it, expect } from "vitest";
import {
  ageLabel, ageMonths, applyPhotoSuggestion, emptyCatDraft, extractStoryByRules, parseAge, parseSex,
  storyDiff, toCatRow, validateCat, zodiacOf,
} from "./cat";

const today = new Date(2026, 9, 28); // 2026-10-28

describe("年紀與星座（UT-02-01～03）", () => {
  it("生日 2024-08-01 → 2 歲、獅子座", () => {
    expect(ageLabel({ birthday: "2024-08-01", estAgeMonths: null }, today)).toBe("2 歲");
    expect(zodiacOf("2024-08-01")).toBe("獅子座");
  });
  it("摩羯座跨年邊界", () => {
    expect(zodiacOf("2020-12-22")).toBe("摩羯座");
    expect(zodiacOf("2021-01-19")).toBe("摩羯座");
    expect(zodiacOf("2021-01-20")).toBe("水瓶座");
  });
  it("生日未知 → 星座 null、顯示估計年齡", () => {
    expect(zodiacOf(null)).toBeNull();
    expect(ageLabel({ birthday: null, estAgeMonths: 36 }, today)).toBe("約 3 歲");
  });
  it("生日當月未滿日不算滿月", () => {
    expect(ageMonths({ birthday: "2026-08-30", estAgeMonths: null }, today)).toBe(1);
  });
});

describe("回答解析", () => {
  it("性別", () => {
    expect(parseSex("男生")).toBe("male");
    expect(parseSex("是母貓")).toBe("female");
    expect(parseSex("還不確定")).toBe("unknown");
  });
  it("生日與估計年齡", () => {
    expect(parseAge("2024/8/1", today)).toEqual({ birthday: "2024-08-01", estAgeMonths: null });
    expect(parseAge("不知道生日，大約 2 歲", today)).toEqual({ birthday: null, estAgeMonths: 24 });
    expect(parseAge("大約6個月", today)).toEqual({ birthday: null, estAgeMonths: 6 });
    expect(parseAge("兩歲半左右", today).estAgeMonths).toBe(24);
    expect(parseAge("2023年撿到的", today)).toEqual({ birthday: null, estAgeMonths: 36 });
  });
});

describe("照片辨識建議（UT-03-04）", () => {
  it("信心低於 0.5 時不預填品種與毛色", () => {
    const draft = emptyCatDraft();
    expect(applyPhotoSuggestion(draft, { isCat: true, breed: "米克斯", coat: "橘白", confidence: 0.49 })).toEqual(draft);
  });

  it("信心達標時才套用品種與毛色", () => {
    const result = applyPhotoSuggestion(emptyCatDraft(), { isCat: true, breed: "米克斯", coat: "橘白", confidence: 0.5 });
    expect(result).toMatchObject({ breed: "米克斯", coat: "橘白" });
  });
});

describe("自由口述整理（FR-03-03）", () => {
  it("抽出性格、癖好、結紮", () => {
    const r = extractStoryByRules("很怕生，但熟了會一直踩踏，最愛紙箱，已結紮");
    expect(r.traits).toContain("怕生");
    expect(r.quirks).toContain("踩踏");
    expect(r.quirks).toContain("紙箱");
    expect(r.neutered).toBe(true);
  });
  it("差異只列出會改變的欄位", () => {
    const before = { ...emptyCatDraft(), name: "橘子" };
    const diff = storyDiff(before, { traits: ["怕生"], name: "橘子", quirks: "" });
    expect(diff.map(x => x.field)).toEqual(["traits"]);
  });
});

describe("驗證與資料列", () => {
  it("必填只有名字、性別、照片（FR-03-04）", () => {
    expect(validateCat(emptyCatDraft())).toHaveLength(3);
    const ok = { ...emptyCatDraft(), name: "橘子", sex: "male" as const, photoUrl: "https://x/y.jpg" };
    expect(validateCat(ok)).toEqual([]);
  });
  it("知道生日時不存估計月齡，並自動帶星座；血型預設未驗（UT-02-10）", () => {
    const row = toCatRow({ ...emptyCatDraft(), name: "橘子", sex: "male", birthday: "2024-08-01", estAgeMonths: 30, photoUrl: "u" });
    expect(row.est_age_months).toBeNull();
    expect(row.zodiac).toBe("獅子座");
    expect(row.blood_type).toBe("unknown");
  });
});
