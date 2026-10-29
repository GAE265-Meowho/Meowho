import { describe, it, expect } from "vitest";
import { ADMIN_MODULES, GRANTABLE_MODULES } from "./types";
import {
  canAccessModule,
  canBan,
  canGrantModule,
  canRemoveSystemAdmin,
  canRevokeModuleGrant,
  canSuspend,
  checkOperation,
  getVisibleSidebar,
  type HqActor,
} from "./permissions";

// T-HQ-03｜UT-HQ-01～11（docs/hq/02 §4.1）。「今天」固定 2026-10-28，權限判斷本身不依賴時間。
const SA1: HqActor = { role: "system_admin", modules: [] };
const SA2: HqActor = { role: "system_admin", modules: [] };
const AD_U: HqActor = { role: "admin", modules: ["user_management"] };
const AD_P: HqActor = { role: "admin", modules: ["products", "knowledge"] };
const CF: HqActor = { role: "member", modules: [] };
const HO: HqActor = { role: "member", modules: [] };
const X: HqActor = { role: "member", modules: [] };

describe("可見模組（UT-HQ-01、02）", () => {
  it("UT-HQ-01 SA1：首頁＋6 個模組，順序同側欄", () => {
    expect(getVisibleSidebar(SA1)).toEqual([
      "home",
      "report_moderation",
      "user_management",
      "products",
      "knowledge",
      "virtual_assets",
      "admin_authorization",
    ]);
  });
  it("UT-HQ-02 AD-P：只有首頁、商品、知識管理", () => {
    expect(getVisibleSidebar(AD_P)).toEqual(["home", "products", "knowledge"]);
  });
  it("授權順序錯亂時仍依側欄順序排列", () => {
    const a: HqActor = { role: "admin", modules: ["knowledge", "report_moderation"] };
    expect(getVisibleSidebar(a)).toEqual(["home", "report_moderation", "knowledge"]);
  });
  it("管理員資料裡即使出現 admin_authorization 也不顯示", () => {
    const a: HqActor = { role: "admin", modules: ["admin_authorization", "products"] };
    expect(getVisibleSidebar(a)).toEqual(["home", "products"]);
  });
  it("非管理員沒有任何可見項目", () => {
    expect(getVisibleSidebar(X)).toEqual([]);
    expect(getVisibleSidebar(null)).toEqual([]);
  });
});

describe("存取模組（UT-HQ-03）", () => {
  it("UT-HQ-03 AD-P 存取用戶權限管理 → not_found", () => {
    expect(canAccessModule(AD_P, "user_management")).toEqual({ allowed: false, error: "not_found" });
  });
  it("AD-P 存取商品 → 允許", () => {
    expect(canAccessModule(AD_P, "products")).toEqual({ allowed: true });
  });
  it("管理員存取 Admin 授權 → not_found；系統管理員允許", () => {
    expect(canAccessModule(AD_U, "admin_authorization")).toEqual({ allowed: false, error: "not_found" });
    expect(canAccessModule(SA1, "admin_authorization")).toEqual({ allowed: true });
  });
  it("一般登入者與未登入者 → not_found", () => {
    expect(canAccessModule(X, "products")).toEqual({ allowed: false, error: "not_found" });
    expect(canAccessModule(null, "products")).toEqual({ allowed: false, error: "not_found" });
  });
});

describe("操作時重新判斷（UT-HQ-04）", () => {
  it("UT-HQ-04 授權在操作前被撤銷 → permission_changed", () => {
    const revoked: HqActor = { role: "admin", modules: [] };
    expect(checkOperation(revoked, "user_management")).toEqual({ allowed: false, error: "permission_changed" });
  });
  it("帳號已被移除管理員身分或查無資料 → permission_changed", () => {
    expect(checkOperation(CF, "user_management")).toEqual({ allowed: false, error: "permission_changed" });
    expect(checkOperation(null, "user_management")).toEqual({ allowed: false, error: "permission_changed" });
  });
  it("授權仍在 → 允許", () => {
    expect(checkOperation(AD_U, "user_management")).toEqual({ allowed: true });
    expect(checkOperation(SA1, "admin_authorization")).toEqual({ allowed: true });
  });
});

describe("canSuspend（UT-HQ-05～08）", () => {
  it("UT-HQ-05 AD-U → 貓友、貓戶長 允許", () => {
    expect(canSuspend(AD_U, CF)).toEqual({ allowed: true });
    expect(canSuspend(AD_U, HO)).toEqual({ allowed: true });
  });
  it("UT-HQ-06 AD-U → AD-P 不允許，需由系統管理員處理", () => {
    expect(canSuspend(AD_U, AD_P)).toEqual({ allowed: false, message: "需由系統管理員處理" });
  });
  it("UT-HQ-07 SA1 → AD-P 允許，並同時收回所有模組授權", () => {
    expect(canSuspend(SA1, AD_P)).toEqual({
      allowed: true,
      revokesGrants: true,
      note: "同時收回所有模組授權",
    });
  });
  it("UT-HQ-08 任何人 → 系統管理員 不允許", () => {
    for (const actor of [SA1, AD_U, AD_P]) {
      const r = canSuspend(actor, SA2);
      expect(r.allowed).toBe(false);
    }
    expect(canSuspend(SA1, SA2)).toMatchObject({ allowed: false, message: "系統管理員不能被停權" });
  });
  it("沒有「用戶權限管理」授權者不能停權任何人", () => {
    expect(canSuspend(AD_P, CF).allowed).toBe(false);
    expect(canSuspend(X, CF).allowed).toBe(false);
  });
});

describe("canBan（UT-HQ-09，R9）", () => {
  it("UT-HQ-09 AD-U 不允許；SA1 允許（對象為一般會員）", () => {
    expect(canBan(AD_U, CF).allowed).toBe(false);
    expect(canBan(SA1, CF)).toEqual({ allowed: true });
  });
  it("R9 系統管理員不能被加入黑名單，須先撤銷其身分", () => {
    expect(canBan(SA1, SA2)).toEqual({
      allowed: false,
      message: "系統管理員不能被加入黑名單，須先由另一位系統管理員撤銷其身分",
    });
  });
  it("黑名單只用於貓友與貓戶長：管理員也不能加入，須先撤銷其身分（Tina 2026-10-29）", () => {
    expect(canBan(SA1, AD_P)).toEqual({
      allowed: false,
      message: "黑名單只用於貓友與貓戶長，管理員須先撤銷身分",
    });
  });
});

describe("最後一位系統管理員（UT-HQ-10）", () => {
  it("UT-HQ-10 只剩 1 位時不能移除", () => {
    expect(canRemoveSystemAdmin(1)).toEqual({ allowed: false, message: "至少要保留一位系統管理員" });
    expect(canRemoveSystemAdmin(0).allowed).toBe(false);
  });
  it("有 2 位以上時可以移除", () => {
    expect(canRemoveSystemAdmin(2)).toEqual({ allowed: true });
  });
});

describe("授予與撤銷模組（UT-HQ-11）", () => {
  it("UT-HQ-11 不可將 Admin 授權授予管理員", () => {
    expect(canGrantModule(SA1, "admin_authorization").allowed).toBe(false);
  });
  it("系統管理員可授予其他 5 個模組", () => {
    for (const m of GRANTABLE_MODULES) expect(canGrantModule(SA1, m)).toEqual({ allowed: true });
    expect(GRANTABLE_MODULES).toHaveLength(ADMIN_MODULES.length - 1);
  });
  it("管理員不能授予或撤銷授權", () => {
    expect(canGrantModule(AD_U, "products").allowed).toBe(false);
    expect(canRevokeModuleGrant(AD_U).allowed).toBe(false);
    expect(canRevokeModuleGrant(SA1)).toEqual({ allowed: true });
  });
});
