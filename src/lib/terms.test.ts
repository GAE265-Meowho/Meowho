import { describe, it, expect } from "vitest";
import { canAgreeTerms, cleanLegalText, hasReadToEnd } from "./terms";

describe("條款是否已讀到最下方", () => {
  it("捲到最底（剛好）算已讀", () => expect(hasReadToEnd({ scrollTop: 700, clientHeight: 300, scrollHeight: 1000 })).toBe(true));
  it("差幾個像素內也算已讀（容許誤差）", () => expect(hasReadToEnd({ scrollTop: 694, clientHeight: 300, scrollHeight: 1000 })).toBe(true));
  it("還沒捲到底不算已讀", () => expect(hasReadToEnd({ scrollTop: 400, clientHeight: 300, scrollHeight: 1000 })).toBe(false));
  it("內容比框還短、不需要捲動時直接算已讀", () => expect(hasReadToEnd({ scrollTop: 0, clientHeight: 300, scrollHeight: 280 })).toBe(true));
});

describe("能否按「同意並繼續」", () => {
  it("沒讀完不能同意", () => expect(canAgreeTerms({ read: false, checked: true })).toBe(false));
  it("讀完但沒勾選不能同意", () => expect(canAgreeTerms({ read: true, checked: false })).toBe(false));
  it("讀完且勾選才能同意", () => expect(canAgreeTerms({ read: true, checked: true })).toBe(true));
});

describe("條款全文整理", () => {
  it("移除第一行標題與 Markdown 符號", () => {
    const md = "# 標題\n\n## 一、範圍\n> **重點** 文字\n| a | b |\n";
    const out = cleanLegalText(md);
    expect(out.startsWith("一、範圍")).toBe(true);
    expect(out).not.toMatch(/[#>*|`]/);
  });
  it("連續空行壓成一個空行", () => expect(cleanLegalText("# t\n甲\n\n\n\n乙")).toBe("甲\n\n乙"));
});
