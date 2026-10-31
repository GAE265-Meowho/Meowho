import { describe, it, expect } from "vitest";
import { decideStart, type StartInput } from "./route";

const base: StartInput = { configured: true, loggedIn: true, wantCat: false, wantNew: false, homesCount: 0, targetFound: false };

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
});
