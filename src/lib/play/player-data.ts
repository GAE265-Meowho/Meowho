// 虛擬飼養：把「這個帳號、這隻貓」的真實資料整理成遊戲要用的格式（純函式，查詢在 components/play/usePlayData.ts）。
// 貓咪：meow_cats（名字、花色、生活階段、生日／估計月齡）；預算：meow_household_budgets；環境報告：meow_env_reports.items。
import type { BodyType } from "@/lib/hq/cat-models/types";
import type { Hazard, HazardLevel } from "./hazards";

export const bodyOfStage = (lifeStage: string | null | undefined): BodyType => (lifeStage === "kitten" ? "kitten" : "adult");

/** 生日優先，其次估計月齡；都沒有回 null */
export function ageMonths(c: { birthday?: string | null; est_age_months?: number | null }, now = new Date()): number | null {
  if (c.birthday) {
    const b = new Date(c.birthday);
    if (!Number.isNaN(b.getTime())) {
      const m = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth()) - (now.getDate() < b.getDate() ? 1 : 0);
      return Math.max(0, m);
    }
  }
  return typeof c.est_age_months === "number" && c.est_age_months >= 0 ? c.est_age_months : null;
}

export function ageText(months: number | null, lifeStage?: string | null): string {
  if (months === null) return lifeStage === "kitten" ? "幼貓" : "";
  if (months < 12) return `${Math.max(1, months)} 個月`;
  const y = Math.floor(months / 12), r = months % 12;
  return r >= 6 ? `${y} 歲多` : `${y} 歲`;
}

/** 畫面上的一行：名字・花色・年紀（缺的就略過） */
export const catKicker = (c: { name: string; coat: string | null; ageText: string }) => [c.name, c.coat, c.ageText].filter(Boolean).join("・");

const LEVELS: Record<string, HazardLevel> = { high: "high", medium: "medium", mid: "medium", low: "low" };

/**
 * 環境報告的風險項目 [{key,label,level,note}] → 遊戲的危險清單。
 * 只取名稱、等級、建議（不含裁切照與位置）；沒有可用項目回 null，由呼叫端改用規則。
 */
export function hazardsFromReport(items: unknown): Hazard[] | null {
  if (!Array.isArray(items)) return null;
  const list: Hazard[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const advice = typeof (r.note ?? r.advice) === "string" ? String(r.note ?? r.advice).trim() : "";
    const key = typeof r.key === "string" && r.key ? r.key : `risk${list.length}`;
    if (!label || !advice) continue;
    list.push({ key, label, level: LEVELS[String(r.level)] ?? "low", advice });
  }
  const rank: Record<HazardLevel, number> = { high: 0, medium: 1, low: 2 };
  return list.length ? list.sort((a, b) => rank[a.level] - rank[b.level]) : null;
}

/** 房間物品清單：沒有報告時的備案是 ruleHazards（見 hazards.ts） */
export interface ReportRowLite { room_model_id: string | null; status: string; items: unknown; created_at: string }

/** 挑一份報告：同一間房建的 ＞ 這個喵戶最新的（只看 ready） */
export function pickReport<T extends ReportRowLite>(rows: readonly T[], roomId: string | null): T | null {
  const ready = rows.filter(r => r.status === "ready").sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (roomId ? ready.find(r => r.room_model_id === roomId) : null) ?? ready[0] ?? null;
}
