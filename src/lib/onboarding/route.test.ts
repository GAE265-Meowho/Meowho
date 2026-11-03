import { describe, it, expect } from "vitest";
import { decideStart, type StartInput } from "./route";

const base: StartInput = { configured: true, loggedIn: true, wantCat: false, wantNew: false, homesCount: 0, householdLimit: 2, targetFound: false };

describe("新貓入戶（Issue #7）", () => {
  it("未登入時先登入", () => expect(decideStart({ ...base, loggedIn: false, wantCat: true })).toBe("login"));
  it("只有一個貓戶也要先選擇", () => expect(decideStart({ ...base, wantCat: true, homesCount: 1 })).toBe("choose"));
  it("沒有貓戶也先到選擇畫面（只能選新家）", () => expect(decideStart({ ...base, wantCat: true, homesCount: 0 })).toBe("choose"));
  it("指定貓戶時直接新增貓咪", () => expect(decideStart({ ...base, wantCat: true, homesCount: 2, targetFound: true })).toBe("cat"));
  it("示範模式不需登入", () => expect(decideStart({ ...base, configured: false, loggedIn: false, wantCat: true })).toBe("choose"));
});

describe("建立喵戶", () => {
  it("沒有喵戶 → 直接開始對話，不先看說明", () => expect(decideStart(base)).toBe("household"));
  it("有貓戶 → 選擇", () => expect(decideStart({ ...base, homesCount: 1 })).toBe("choose"));
  it("指定建立新貓戶且未滿 → 建立", () => expect(decideStart({ ...base, homesCount: 1, wantNew: true })).toBe("household"));
  it("已滿 2 戶 → 選擇", () => expect(decideStart({ ...base, homesCount: 2, wantNew: true })).toBe("choose"));
  it("不限制時，有很多戶也能建立新的", () => expect(decideStart({ ...base, homesCount: 9, wantNew: true, householdLimit: null })).toBe("household"));
});

describe("登入後引導建立喵戶（規格 09 §7.1）", () => {
  it("沒有喵戶 → 先說明為什麼要建立", () => expect(decideStart({ ...base, wantGuide: true })).toBe("guide"));
  it("已經有喵戶 → 回到原本那一步", () => expect(decideStart({ ...base, wantGuide: true, homesCount: 1 })).toBe("back"));
  it("沒登入仍然先登入", () => expect(decideStart({ ...base, wantGuide: true, loggedIn: false })).toBe("login"));
});
