import { describe, expect, it } from "vitest";
import { describeAudit, formatTaipei, roleLabel } from "./audit";

describe("稽核日誌顯示文字", () => {
  it("授予／撤銷模組顯示模組中文名", () => {
    expect(describeAudit({ action: "grant_module", detail: { module: "products" } })).toBe("授予模組：商品");
    expect(describeAudit({ action: "revoke_grant", detail: { module: "user_management" } })).toBe("撤銷模組授權：用戶權限管理");
  });
  it("變更角色顯示前後", () => expect(describeAudit({ action: "set_role", detail: { from: "member", to: "admin" } })).toBe("變更角色：一般會員 → 管理員"));
  it("網站設定", () => expect(describeAudit({ action: "update_setting", detail: { key: "logo" } })).toBe("變更網站設定：網站 Logo"));
  it("其他處置只顯示名稱", () => expect(describeAudit({ action: "suspend", detail: null })).toBe("停權"));
  it("台北時間", () => expect(formatTaipei("2026-10-29T03:05:00Z")).toBe("2026/10/29 11:05"));
  it("角色名稱", () => { expect(roleLabel("system_admin")).toBe("系統管理員"); expect(roleLabel(null)).toBe("一般會員"); });
});
