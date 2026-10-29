// MeowHQ 外殼的純函式測試：UT-HQ-12、13、14、15、16、41（docs/hq/02）
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";
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

describe("側欄可見模組（stub，待 #20 改接）", () => {
  it("系統管理員：首頁＋全部模組，依規格順序", () => {
    expect(visibleSidebar({ role: "system_admin", grants: [] })).toEqual([
      "home", "report_moderation", "user_management", "products", "knowledge", "virtual_assets", "admin_authorization",
    ]);
  });
  it("管理員：只有首頁與被授權模組，不含 Admin 授權", () => {
    expect(visibleSidebar({ role: "admin", grants: ["knowledge", "products", "admin_authorization"] })).toEqual(["home", "products", "knowledge"]);
  });
  it("grants 為 null（資料庫還是舊結構）：退回示範資料＝全部模組", () => {
    expect(visibleSidebar({ role: "admin", grants: null })).toHaveLength(7);
  });
  it("一般會員：沒有任何項目", () => expect(visibleSidebar({ role: "member", grants: [] })).toEqual([]));
});
