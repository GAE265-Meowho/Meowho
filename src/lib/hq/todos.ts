// MeowHQ｜待辦總覽（T-HQ-07，規格書 §4.1）
// 純函式：資料由頁面查好後傳入；待辦數 undefined＝該模組的資料來源尚未建立（顯示「模組開發中」，不當成 0 筆）。
import { getVisibleSidebar, type HqActor } from "./permissions";
import { ADMIN_MODULE_LABELS, type AdminModule } from "./types";

export interface TodoDef { key: string; label: string; href: string }

/** 各模組的待辦項目與點入後的篩選（UT-HQ-32）。Admin 授權不顯示待辦數，改顯示最近授權變更。 */
export const TODO_DEFS: Record<AdminModule, TodoDef[]> = {
  report_moderation: [
    { key: "reports_open", label: "未處理檢舉", href: "/MeowHQ/reports?status=open" },
    { key: "ai_flags_pending", label: "AI 標記待審", href: "/MeowHQ/reports?tab=ai&status=pending" },
  ],
  user_management: [
    { key: "verifications_pending", label: "待審中途認證", href: "/MeowHQ/users?tab=shelters&status=pending" },
  ],
  products: [
    { key: "products_import_pending", label: "待審核的匯入商品", href: "/MeowHQ/products?status=pending" },
    { key: "prices_stale", label: "參考價超過 3 個月未更新", href: "/MeowHQ/products?status=stale" },
  ],
  knowledge: [{ key: "articles_draft", label: "草稿中的文章", href: "/MeowHQ/knowledge?status=draft" }],
  virtual_assets: [{ key: "assets_draft", label: "尚未上架的元件", href: "/MeowHQ/assets?status=draft" }],
  admin_authorization: [],
};

export type TodoCounts = Partial<Record<string, number>>;
export interface TodoItem extends TodoDef { count: number }
export interface TodoCard {
  module: AdminModule;
  label: string;
  items: TodoItem[];
  total: number;
  status: "todo" | "empty" | "unavailable" | "info";
  statusText: string;
}

/** 依登入者權限產生卡片（UT-HQ-29、30）：順序同側欄，只含有權限的模組 */
export function buildTodoCards(actor: HqActor | null | undefined, counts: TodoCounts): TodoCard[] {
  return getVisibleSidebar(actor)
    .filter((i): i is AdminModule => i !== "home")
    .map(module => {
      const defs = TODO_DEFS[module];
      const label = ADMIN_MODULE_LABELS[module];
      if (defs.length === 0) return { module, label, items: [], total: 0, status: "info", statusText: "最近的授權變更" } satisfies TodoCard;
      const known = defs.filter(d => typeof counts[d.key] === "number");
      const items = known.map(d => ({ ...d, count: counts[d.key] as number }));
      const total = items.reduce((s, i) => s + i.count, 0);
      if (known.length === 0) return { module, label, items: [], total: 0, status: "unavailable", statusText: "模組開發中" } satisfies TodoCard;
      return { module, label, items, total, status: total > 0 ? "todo" : "empty", statusText: total > 0 ? `${total} 件待處理` : "目前沒有待辦" } satisfies TodoCard;
    });
}

const TAIPEI_MS = 8 * 60 * 60 * 1000;
const taipeiDate = (d: Date) => new Date(d.getTime() + TAIPEI_MS).toISOString().slice(0, 10);

/** 參考價是否超過 3 個月未更新（UT-HQ-31）：紀錄日早於「今天往前 3 個月的同一天」即算過期（台北日期） */
export function isPriceStale(recordedAt: string | Date, now: Date): boolean {
  const [y, m, d] = taipeiDate(now).split("-").map(Number);
  const cutoff = new Date(Date.UTC(y, m - 1 - 3, d)).toISOString().slice(0, 10);
  const rec = typeof recordedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(recordedAt) ? recordedAt : taipeiDate(new Date(recordedAt));
  return rec < cutoff;
}

/** 登入者自己最近 n 筆管理動作，新到舊（UT-HQ-33；完整稽核日誌只有系統管理員看得到） */
export function recentOwnActions<T extends { actor_id: string; created_at: string }>(logs: readonly T[], actorId: string, n = 5): T[] {
  return logs
    .filter(l => l.actor_id === actorId)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, n);
}
