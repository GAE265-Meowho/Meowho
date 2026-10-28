import { describe, it, expect } from "vitest";
import { friendlyDbError, validateVerification } from "./verification";

describe("錯誤訊息", () => {
  it("資料庫上限錯誤轉成說明", () => {
    expect(friendlyDbError('new row violates: household_limit')).toContain("最多建立 2 個貓戶");
  });
});

describe("中途之家認證申請", () => {
  const ok = { orgType: "personal_foster" as const, orgName: "", proofUrl: "https://facebook.com/xxcats", description: "在台中做個人中途三年，目前照顧 6 隻貓" };
  it("個人中途不需填單位名稱", () => expect(validateVerification(ok)).toEqual([]));
  it("協會要填名稱", () => expect(validateVerification({ ...ok, orgType: "shelter_org" })).toContain("請填寫協會或單位名稱"));
  it("連結格式", () => expect(validateVerification({ ...ok, proofUrl: "facebook" })).toContain("證明連結需為 http(s) 網址"));
  it("連結可留空", () => expect(validateVerification({ ...ok, proofUrl: "" })).toEqual([]));
  it("說明太短", () => expect(validateVerification({ ...ok, description: "中途" }).length).toBe(1));
});
