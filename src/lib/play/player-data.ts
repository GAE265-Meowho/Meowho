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

// ---------- 中途對這隻貓的評論 → 遊戲一開始的信任與壓力 ----------
// 數字只來自這裡的公式（AI 不產生數字）：個性量表（跟人的距離、膽量、適應新環境）、個性標籤、到家後的反應（躲多久、多久讓你摸）。
// 量表有填就用量表，沒有才看標籤，兩個都沒有才看介紹文字裡的關鍵字，避免重複加分。
export interface KeeperNotes {
  scale?: { energy?: number | null; bond?: number | null; brave?: number | null; adapt?: number | null } | null;
  tags?: readonly string[] | null;
  /** 中途寫的介紹、各條拉桿的補充說明（只在量表和標籤都沒有時才用關鍵字） */
  text?: string | null;
  /** 到家後的反應：hide＝躲到願意出來要多久、touch＝多久讓你摸（same_day／1_3_days／within_week／longer） */
  arrival?: Record<string, string> | null;
}
export interface StartMood { trust: number; stress: number; reasons: string[] }
export const BASE_MOOD = { trust: 30, stress: 40 } as const;

const BOND: Record<number, [number, string]> = { 1: [-8, "很獨立"], 2: [-4, "偏獨立"], 4: [6, "偏黏人"], 5: [12, "超黏人"] };
const BRAVE: Record<number, [number, number, string]> = { 1: [-8, 10, "很膽小"], 2: [-4, 5, "有點怕生"], 4: [4, -5, "偏大膽"], 5: [8, -10, "超大膽"] };
const ADAPT: Record<number, [number, string]> = { 1: [12, "適應新環境要很久"], 2: [6, "偏慢熱"], 4: [-6, "適應得快"], 5: [-12, "很快就自在"] };
const TAGS: Record<string, [number, number]> = {
  黏人: [8, 0], 親人: [6, -3], 愛撒嬌: [4, 0], 愛被抱: [3, 0], 溫和: [2, -3], 適應力好: [0, -8],
  怕生: [-6, 6], 膽小: [-8, 8], 慢熱: [0, 6], 獨立: [-4, 0], 有小脾氣: [0, 4], 愛咬人: [-4, 4], 怕寂寞: [2, 3],
};
const ARRIVE_HIDE: Record<string, number> = { same_day: -6, "1_3_days": -2, within_week: 4, longer: 8 };
const ARRIVE_TOUCH: Record<string, number> = { same_day: 6, "1_3_days": 3, within_week: 0, longer: -4 };
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function startMood(n: KeeperNotes): StartMood {
  let trust: number = BASE_MOOD.trust, stress: number = BASE_MOOD.stress;
  const reasons: string[] = [];
  const sc = n.scale ?? {};
  const hasScale = [sc.bond, sc.brave, sc.adapt].some(v => typeof v === "number");
  const tags = (n.tags ?? []).filter(t => t in TAGS);
  if (hasScale) {
    const b = typeof sc.bond === "number" ? BOND[sc.bond] : undefined, r = typeof sc.brave === "number" ? BRAVE[sc.brave] : undefined, a = typeof sc.adapt === "number" ? ADAPT[sc.adapt] : undefined;
    if (b) { trust += b[0]; reasons.push(b[1]); }
    if (r) { trust += r[0]; stress += r[1]; reasons.push(r[2]); }
    if (a) { stress += a[0]; reasons.push(a[1]); }
  } else if (tags.length) {
    for (const t of tags) { trust += TAGS[t][0]; stress += TAGS[t][1]; reasons.push(t); }
  } else if (n.text) {
    for (const k of Object.keys(TAGS)) if (n.text.includes(k)) { trust += TAGS[k][0]; stress += TAGS[k][1]; reasons.push(k); }
  }
  const h = n.arrival?.hide, t = n.arrival?.touch;
  if (h && h in ARRIVE_HIDE) { stress += ARRIVE_HIDE[h]; reasons.push(h === "same_day" ? "到家當天就敢出來" : h === "longer" ? "到家要躲很久" : ""); }
  if (t && t in ARRIVE_TOUCH) { trust += ARRIVE_TOUCH[t]; reasons.push(t === "same_day" ? "到家當天就讓人摸" : t === "longer" ? "要很久才讓人摸" : ""); }
  return { trust: clampN(Math.round(trust), 10, 80), stress: clampN(Math.round(stress), 15, 80), reasons: reasons.filter(Boolean) };
}

/** 中途填的摸摸地圖（頭頂、耳後、臉頰、下巴、背… 各是 love／ok／no）→ 摸貓小遊戲的最愛：頭、下巴、背三選一 */
export function touchFavOf(touch: Record<string, string> | null | undefined): "head" | "chin" | "back" | null {
  if (!touch) return null;
  const love = (k: string) => touch[k] === "love";
  if (love("top") || love("ear") || love("cheek")) return "head";
  if (love("chin")) return "chin";
  if (love("back")) return "back";
  return null;
}
