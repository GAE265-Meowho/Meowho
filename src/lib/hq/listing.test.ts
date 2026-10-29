// 列表共用規則：UT-HQ-34～38（docs/hq/02 §4.5）
import { describe, expect, it } from "vitest";
import { BATCH_ACTIONS, PAGE_SIZE, canBatch, paginate, parseListQuery, sortRows, toSearchString } from "./listing";

describe("UT-HQ-34 篩選條件 ↔ 網址參數", () => {
  it("序列化再還原後完全相同", () => {
    const q = { tab: "shelters", q: "台中 中途", status: "pending", page: 3 };
    expect(parseListQuery(new URLSearchParams(toSearchString(q)))).toEqual(q);
  });
  it("預設值不寫進網址（第 1 頁、空字串）", () => {
    expect(toSearchString({ q: "", page: 1, status: "pending" })).toBe("?status=pending");
    expect(toSearchString({})).toBe("");
  });
  it("頁碼不合法時回到第 1 頁", () => {
    expect(parseListQuery(new URLSearchParams("page=abc")).page).toBe(1);
    expect(parseListQuery(new URLSearchParams("page=-2")).page).toBe(1);
  });
});

const rows = [
  { id: "a", created_at: "2026-10-20T00:00:00Z" },
  { id: "b", created_at: "2026-10-27T00:00:00Z" },
  { id: "c", created_at: "2026-10-01T00:00:00Z" },
];

describe("UT-HQ-35／36 排序", () => {
  it("待處理佇列：等最久的在前", () => expect(sortRows(rows, "queue").map(r => r.id)).toEqual(["c", "a", "b"]));
  it("一般列表：最新的在前", () => expect(sortRows(rows, "latest").map(r => r.id)).toEqual(["b", "a", "c"]));
  it("不改動原陣列", () => {
    sortRows(rows, "queue");
    expect(rows.map(r => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("UT-HQ-37 分頁", () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  it("每頁 20 筆；45 筆的第 3 頁有 5 筆", () => {
    expect(PAGE_SIZE).toBe(20);
    const p = paginate(items, 3);
    expect(p.rows).toHaveLength(5);
    expect(p.pageCount).toBe(3);
    expect(p.rows[0]).toBe(40);
  });
  it("超過最後一頁時回到最後一頁", () => expect(paginate(items, 9).page).toBe(3));
  it("沒有資料時是第 1 頁、0 筆", () => expect(paginate([], 2)).toMatchObject({ page: 1, pageCount: 1, rows: [] }));
});

describe("UT-HQ-38 批次動作白名單", () => {
  it("允許：檢舉標為無需處理、匯入商品審核通過", () => {
    expect(canBatch("report_dismiss")).toBe(true);
    expect(canBatch("product_import_approve")).toBe(true);
  });
  it("不允許：停權、黑名單、撤銷授權", () => {
    for (const a of ["suspend", "ban", "revoke_grant"]) expect(canBatch(a)).toBe(false);
  });
  it("白名單只有兩項", () => expect([...BATCH_ACTIONS]).toEqual(["report_dismiss", "product_import_approve"]));
});
