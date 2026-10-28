import { describe, it, expect } from "vitest";
import {
  ADMIN_MODULES,
  ADMIN_MODULE_LABELS,
  GRANTABLE_MODULES,
  HQ_DISPOSITIONS,
  HQ_ERROR_CODES,
  HQ_ROLES,
  HQ_SIDEBAR_ORDER,
  QUICK_REASONS,
  SYSTEM_ADMIN_ONLY_MODULES,
} from "./types";

// T-HQ-01 共用約定測試。
// 這裡只驗證「常數」本身與規格書一致，作為 UT-HQ-01／11／19／28／41 的基礎；
// 權限判斷、處置規則等行為測試由階段 1 的 T-HQ-03、T-HQ-04、T-HQ-06 實作。

describe("後台模組代號（規格書 §4.2、決策 003）", () => {
  it("共 6 個模組", () => {
    expect(ADMIN_MODULES).toHaveLength(6);
  });
  it("每個模組都有中文名稱，名稱與名詞表一致", () => {
    expect(ADMIN_MODULES.map((m) => ADMIN_MODULE_LABELS[m])).toEqual([
      "檢舉與內容審核",
      "用戶權限管理",
      "商品",
      "知識管理",
      "虛擬體驗元件管理",
      "Admin 授權",
    ]);
  });
});

describe("側欄順序（UT-HQ-01 基礎，規格書 §4.0）", () => {
  it("首頁 → 檢舉 → 用戶權限 → 商品 → 知識 → 虛擬體驗元件 → Admin 授權", () => {
    expect(HQ_SIDEBAR_ORDER).toEqual([
      "home",
      "report_moderation",
      "user_management",
      "products",
      "knowledge",
      "virtual_assets",
      "admin_authorization",
    ]);
  });
  it("側欄項目＝首頁＋全部 6 個模組，沒有多也沒有少", () => {
    expect([...HQ_SIDEBAR_ORDER].sort()).toEqual(["home", ...ADMIN_MODULES].sort());
  });
  it("Admin 授權排在最後（其前有分隔線）", () => {
    expect(HQ_SIDEBAR_ORDER[HQ_SIDEBAR_ORDER.length - 1]).toBe("admin_authorization");
  });
});

describe("可授權模組（UT-HQ-11 基礎）", () => {
  it("Admin 授權只有系統管理員能用", () => {
    expect(SYSTEM_ADMIN_ONLY_MODULES).toEqual(["admin_authorization"]);
  });
  it("可授予管理員的模組＝其餘 5 個，不含 Admin 授權", () => {
    expect(GRANTABLE_MODULES).toHaveLength(5);
    expect(GRANTABLE_MODULES).not.toContain("admin_authorization");
  });
  it("可授權模組的順序與側欄一致", () => {
    const sidebarModules = HQ_SIDEBAR_ORDER.filter((x) => x !== "home" && GRANTABLE_MODULES.includes(x as never));
    expect(GRANTABLE_MODULES).toEqual(sidebarModules);
  });
});

describe("角色（規格書 §3）", () => {
  it("三種：系統管理員、管理員、一般會員", () => {
    expect(HQ_ROLES).toEqual(["system_admin", "admin", "member"]);
  });
});

describe("處置類型（規格書 §4.6，UT-HQ-19 基礎）", () => {
  it("八種：停權、解除停權、撤銷授權、撤銷徽章、下架、重新上架、加入黑名單、移出黑名單", () => {
    expect([...HQ_DISPOSITIONS].sort()).toEqual(
      ["ban", "relist", "revoke_badge", "revoke_grant", "suspend", "takedown", "unban", "unsuspend"].sort()
    );
  });
  it("授予類（授權、授予徽章、變更角色）不是處置，只作為稽核日誌 action", () => {
    for (const a of ["grant_module", "grant_badge", "set_role"]) expect(HQ_DISPOSITIONS).not.toContain(a);
  });
  it("每個處置都有快選原因清單（可為空陣列）", () => {
    for (const d of HQ_DISPOSITIONS) expect(Array.isArray(QUICK_REASONS[d])).toBe(true);
  });
});

describe("快選原因（UT-HQ-28 基礎，規格書 §4.7）", () => {
  it("停權：疑似販售貓咪、詐騙、辱罵或騷擾、不實資料、其他", () => {
    expect(QUICK_REASONS.suspend).toEqual(["疑似販售貓咪", "詐騙", "辱罵或騷擾", "不實資料", "其他"]);
  });
  it("下架：非貓內容、不當內容、重複、其他", () => {
    expect(QUICK_REASONS.takedown).toEqual(["非貓內容", "不當內容", "重複", "其他"]);
  });
  it("撤銷授權與撤銷徽章：職務異動、資料不符、其他", () => {
    expect(QUICK_REASONS.revoke_grant).toEqual(["職務異動", "資料不符", "其他"]);
    expect(QUICK_REASONS.revoke_badge).toEqual(["職務異動", "資料不符", "其他"]);
  });
  it("規格書未列快選原因的處置（解除停權、重新上架、黑名單、移出黑名單）為空清單，只填自由文字", () => {
    expect(QUICK_REASONS.unban).toEqual([]);
    expect(QUICK_REASONS.unsuspend).toEqual([]);
    expect(QUICK_REASONS.relist).toEqual([]);
    expect(QUICK_REASONS.ban).toEqual([]);
  });
});

describe("錯誤代碼（UT-HQ-41 基礎，規格書 §4.7）", () => {
  it("三種：not_found、permission_changed、network", () => {
    expect(HQ_ERROR_CODES).toEqual(["not_found", "permission_changed", "network"]);
  });
});
