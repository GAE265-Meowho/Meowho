// MeowHQ｜列表共用規則（T-HQ-08，規格書 §4.8）：篩選寫入網址、排序、分頁、批次白名單

export interface ListQuery { tab?: string; q?: string; status?: string; page?: number }

export const PAGE_SIZE = 20;

/** 篩選條件 → 網址參數（UT-HQ-34）；預設值（空字串、第 1 頁）不寫入，讓網址保持乾淨 */
export function toSearchString(q: ListQuery): string {
  const p = new URLSearchParams();
  if (q.tab) p.set("tab", q.tab);
  if (q.q && q.q.trim()) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.page && q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** 網址參數 → 篩選條件（UT-HQ-34）；複製網址給其他管理員可看到相同結果 */
export function parseListQuery(p: URLSearchParams): Required<Pick<ListQuery, "page">> & ListQuery {
  const out: ListQuery & { page: number } = { page: 1 };
  const tab = p.get("tab"), q = p.get("q"), status = p.get("status"), page = Number(p.get("page"));
  if (tab) out.tab = tab;
  if (q) out.q = q;
  if (status) out.status = status;
  out.page = Number.isInteger(page) && page > 1 ? page : 1;
  return out;
}

/** 排序（UT-HQ-35、36）：待處理佇列＝等最久的在前；一般列表＝最新的在前 */
export function sortRows<T extends { created_at: string }>(rows: readonly T[], mode: "queue" | "latest"): T[] {
  const sorted = rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  return mode === "queue" ? sorted : sorted.reverse();
}

/** 分頁（UT-HQ-37）：每頁 20 筆；頁碼超出範圍時夾到第 1 頁或最後一頁 */
export function paginate<T>(rows: readonly T[], page: number, size = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { page: p, pageCount, total: rows.length, rows: rows.slice((p - 1) * size, p * size) };
}

/** 只開放低風險的批次操作（UT-HQ-38）；停權、黑名單、撤銷授權一律單筆處理 */
export const BATCH_ACTIONS = ["report_dismiss", "product_import_approve"] as const;
export type BatchAction = (typeof BATCH_ACTIONS)[number];
export const canBatch = (action: string): action is BatchAction => (BATCH_ACTIONS as readonly string[]).includes(action);
