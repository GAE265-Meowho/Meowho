// 待辦總覽：UT-HQ-29～33（docs/hq/02 §4.4）
import { describe, expect, it } from "vitest";
import { buildTodoCards, isPriceStale, recentOwnActions } from "./todos";

const now = new Date("2026-10-28T04:00:00Z"); // 台北 2026-10-28 12:00
const SA = { role: "system_admin" as const, modules: [] };
const ADP = { role: "admin" as const, modules: ["products", "knowledge"] as const };

describe("UT-HQ-29 只顯示有權限的模組", () => {
  it("AD-P 只有商品、知識管理兩張卡片", () => {
    expect(buildTodoCards(ADP, {}).map(c => c.module)).toEqual(["products", "knowledge"]);
  });
  it("系統管理員看到全部模組，依側欄順序，Admin 授權在最後", () => {
    expect(buildTodoCards(SA, {}).map(c => c.module)).toEqual([
      "report_moderation", "user_management", "products", "knowledge", "virtual_assets", "admin_authorization",
    ]);
  });
  it("非管理員沒有任何卡片", () => expect(buildTodoCards({ role: "member", modules: [] }, {})).toEqual([]));
});

describe("UT-HQ-30 待辦 0 筆", () => {
  it("卡片顯示「目前沒有待辦」", () => {
    const card = buildTodoCards(SA, { verifications_pending: 0 }).find(c => c.module === "user_management")!;
    expect(card.total).toBe(0);
    expect(card.status).toBe("empty");
    expect(card.statusText).toBe("目前沒有待辦");
  });
  it("有待辦時顯示數量", () => {
    const card = buildTodoCards(SA, { verifications_pending: 3 }).find(c => c.module === "user_management")!;
    expect(card.total).toBe(3);
    expect(card.status).toBe("todo");
  });
  it("資料來源尚未建立的模組標示「模組開發中」，不當成 0 筆", () => {
    const card = buildTodoCards(SA, {}).find(c => c.module === "products")!;
    expect(card.status).toBe("unavailable");
    expect(card.statusText).toBe("模組開發中");
  });
  it("Admin 授權不顯示待辦數", () => {
    const card = buildTodoCards(SA, {}).find(c => c.module === "admin_authorization")!;
    expect(card.items).toEqual([]);
    expect(card.status).toBe("info");
  });
});

describe("UT-HQ-31 參考價超過 3 個月未更新", () => {
  it("2026-07-27 計入、2026-07-29 不計", () => {
    expect(isPriceStale("2026-07-27", now)).toBe(true);
    expect(isPriceStale("2026-07-29", now)).toBe(false);
  });
});

describe("UT-HQ-32 卡片連結帶入篩選", () => {
  it("待審中途認證 → 用戶權限管理的中途認證分頁＋status=pending", () => {
    const item = buildTodoCards(SA, { verifications_pending: 2 }).find(c => c.module === "user_management")!.items[0];
    expect(item.href).toBe("/MeowHQ/users?tab=shelters&status=pending");
  });
});

describe("UT-HQ-33 最近管理動作", () => {
  const logs = Array.from({ length: 8 }, (_, i) => ({
    id: i, actor_id: i % 2 === 0 ? "me" : "other", created_at: `2026-10-2${i}T00:00:00Z`, action: "suspend",
  }));
  it("只回傳登入者自己的最近 5 筆，新到舊", () => {
    const r = recentOwnActions(logs, "me");
    expect(r.every(l => l.actor_id === "me")).toBe(true);
    expect(r.map(l => l.id)).toEqual([6, 4, 2, 0]);
    const many = Array.from({ length: 9 }, (_, i) => ({ id: i, actor_id: "me", created_at: `2026-10-1${i}T00:00:00Z` }));
    expect(recentOwnActions(many, "me").map(l => l.id)).toEqual([8, 7, 6, 5, 4]);
  });
});
