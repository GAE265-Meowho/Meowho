// MeowHQ 外殼的純函式測試：UT-HQ-12、13、14、15、16、41（docs/hq/02）
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { friendlyError, hqErrorMessage } from "./errors";
import { hqRedirectTarget, resolveGate, visibleSidebar } from "./access";
import { metadata } from "@/app/MeowHQ/layout";

describe("UT-HQ-12 大小寫導向", () => {
  it.each([
    ["/meowhq", "", "/MeowHQ"],
    ["/MEOWHQ", "", "/MeowHQ"],
    ["/meowhq/users", "?status=pending", "/MeowHQ/users?status=pending"],
  ])("%s%s → %s", (p, q, to) => expect(hqRedirectTarget(p, q)).toBe(to));
  it("已是正確寫法或其他路徑不導向", () => {
    expect(hqRedirectTarget("/MeowHQ", "")).toBeNull();
    expect(hqRedirectTarget("/MeowHQ/users", "?a=1")).toBeNull();
    expect(hqRedirectTarget("/meowhqx", "")).toBeNull();
    expect(hqRedirectTarget("/cats", "")).toBeNull();
  });
});

describe("UT-HQ-13／14 登入閘門", () => {
  const base = { configured: true, loading: false };
  it("載入中", () => expect(resolveGate({ ...base, loading: true, signedIn: false, role: null })).toBe("loading"));
  it("未登入 → 登入頁", () => expect(resolveGate({ ...base, signedIn: false, role: null })).toBe("login"));
  it("一般登入者 → 找不到頁面", () => expect(resolveGate({ ...base, signedIn: true, role: "member" })).toBe("not_found"));
  it("管理員與系統管理員 → 通過", () => {
    expect(resolveGate({ ...base, signedIn: true, role: "admin" })).toBe("ok");
    expect(resolveGate({ ...base, signedIn: true, role: "system_admin" })).toBe("ok");
  });
  it("已登入但讀不到會員資料 → 找不到頁面", () => expect(resolveGate({ ...base, signedIn: true, role: null })).toBe("not_found"));
});

// 舊後台已移除（Tina 2026-10-29 決定，功能移到 #23、#24）
it("UT-HQ-15 舊路徑 /mh-console-8k2p 已移除（找不到頁面）", () => {
  expect(existsSync(path.resolve(__dirname, "../../app/mh-console-8k2p"))).toBe(false);
});

it("UT-HQ-16 metadata：標題與 noindex", () => {
  expect(metadata.title).toBe("MeowHQ｜喵星總部");
  expect(metadata.robots).toMatchObject({ index: false, follow: false });
});

it("UT-HQ-41 錯誤轉白話，不顯示代碼", () => {
  expect(friendlyError("network")).toBe("網路中斷，請再試一次");
  expect(friendlyError("permission_changed")).toBe("你的權限已變更");
  expect(friendlyError("anything")).toBe("發生問題，請稍後再試");
  expect(friendlyError(undefined)).toBe("發生問題，請稍後再試");
  for (const c of ["network", "permission_changed", "x"]) expect(friendlyError(c)).not.toContain(c);
});

describe("側欄可見模組（改接 permissions.ts）", () => {
  it("系統管理員：首頁＋全部模組，依規格順序", () => {
    expect(visibleSidebar({ role: "system_admin", grants: [] })).toEqual([
      "home", "report_moderation", "user_management", "products", "knowledge", "virtual_assets", "admin_authorization",
    ]);
  });
  it("管理員：只有首頁與被授權模組，不含 Admin 授權", () => {
    expect(visibleSidebar({ role: "admin", grants: ["knowledge", "products", "admin_authorization"] })).toEqual(["home", "products", "knowledge"]);
  });
  it("grants 為 null（讀取中或讀取失敗）：管理員只看到首頁，不再退回「全部可見」", () => {
    expect(visibleSidebar({ role: "admin", grants: null })).toEqual(["home"]);
  });
  it("一般會員：沒有任何項目", () => expect(visibleSidebar({ role: "member", grants: [] })).toEqual([]));
});

describe("資料庫錯誤轉白話（hqErrorMessage）", () => {
  it("有 hint 時直接顯示 hint（資料庫函式提供的中文說明）", () => {
    expect(hqErrorMessage({ message: "need_system_admin", hint: "需由系統管理員處理" })).toBe("需由系統管理員處理");
  });
  it("沒有 hint 的已知代碼轉成白話", () => {
    expect(hqErrorMessage({ message: "reason_required" })).toBe("請填寫原因");
    expect(hqErrorMessage({ message: "permission_denied" })).toBe("你的權限已變更");
  });
  it("網路錯誤", () => expect(hqErrorMessage(new TypeError("Failed to fetch"))).toBe("網路中斷，請再試一次"));
  it("未知錯誤不顯示代碼", () => expect(hqErrorMessage({ message: "xyz_internal" })).toBe("發生問題，請稍後再試"));
});
