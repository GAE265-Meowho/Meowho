// 虛擬飼養：存給中途看的試養報告摘要（meow_task_runs.game_report，0033）。
// 只放選擇、花費、照顧紀錄；不放家裡的位置、物件清單、危險清單與裁切照（試養報告的隱私規則，見 story.ts 檔頭）。
// 金額全部來自公式，AI 不產生數字。純函式。
import { costTotal } from "./costs";
import type { Life } from "./story";

export interface PlayReport {
  v: 1;
  catName: string;
  /** 試養了幾年（劇本時間，到最後一個節點） */
  years: number;
  /** 貓對你的信任 0～100、壓力 0～100 */
  trust: number;
  stress: number;
  picks: { t: string; good: boolean | null }[];
  events: string[];
  cost: { once: number; month: number; med: number; acc: number; other: number; total: number };
  /** 玩家填的每月預算、採買算出的每月固定開銷 */
  budget: number;
  monthly: number;
  overBudget: boolean;
  care: { rounds: number; log: Record<string, number> };
}

const MAX_PICKS = 40;
const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown, a = 0, b = 1e9) => (typeof v === "number" && Number.isFinite(v) ? Math.max(a, Math.min(b, Math.round(v))) : 0);

export function buildPlayReport(input: { life: Life; startMonths: number; budget: number; monthly: number }): PlayReport {
  const X = input.life, C = X.cost;
  return {
    v: 1,
    catName: text(X.name, 12),
    years: Math.max(1, Math.round((X.age - input.startMonths) / 12)),
    trust: num(X.trust, 0, 100), stress: num(X.stress, 0, 100),
    picks: X.picks.slice(0, MAX_PICKS).map(p => ({ t: text(p.t, 80), good: p.good })),
    events: X.events.slice(0, 20).map(e => text(e.t, 80)),
    cost: { once: num(C.once), month: num(C.month), med: num(C.med), acc: num(C.acc), other: num(C.other), total: num(costTotal(C)) },
    budget: num(input.budget), monthly: num(input.monthly),
    overBudget: input.budget > 0 && input.monthly > input.budget,
    care: { rounds: num(X.care.rounds, 0, 100), log: Object.fromEntries(Object.entries(X.care.log).map(([k, v]) => [text(k, 12), num(v, 0, 1000)])) },
  };
}

/** 讀回資料庫的報告（欄位可能缺、型別可能不對）；不是這個格式回 null */
export function parsePlayReport(raw: unknown): PlayReport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !text(r.catName, 12)) return null;
  const cost = (r.cost && typeof r.cost === "object" ? r.cost : {}) as Record<string, unknown>;
  const care = (r.care && typeof r.care === "object" ? r.care : {}) as Record<string, unknown>;
  const log = (care.log && typeof care.log === "object" && !Array.isArray(care.log) ? care.log : {}) as Record<string, unknown>;
  return {
    v: 1, catName: text(r.catName, 12), years: num(r.years, 0, 100), trust: num(r.trust, 0, 100), stress: num(r.stress, 0, 100),
    picks: (Array.isArray(r.picks) ? r.picks : []).slice(0, MAX_PICKS).map(p => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { t: text(o.t, 80), good: typeof o.good === "boolean" ? o.good : null };
    }).filter(p => p.t),
    events: (Array.isArray(r.events) ? r.events : []).slice(0, 20).map(e => text(e, 80)).filter(Boolean),
    cost: { once: num(cost.once), month: num(cost.month), med: num(cost.med), acc: num(cost.acc), other: num(cost.other), total: num(cost.total) },
    budget: num(r.budget), monthly: num(r.monthly), overBudget: r.overBudget === true,
    care: { rounds: num(care.rounds, 0, 100), log: Object.fromEntries(Object.entries(log).map(([k, v]) => [text(k, 12), num(v, 0, 1000)])) },
  };
}
