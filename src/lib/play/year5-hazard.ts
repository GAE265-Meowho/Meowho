// 節點 5（五年後）看完醫生回到家、出現「小叮嚀」那一刻，跳出居家危險提醒彈窗（渝茜 2026-11-14）。
// 照片只走既有同源 API：GET /api/homes/[id]/reports/[reportId]（使用者 session／RLS 驗證本人或分享的中途），
// 裁切照用回應裡的 cropUrl（/crops/[key]，每次重新授權後 307 到短效網址）。不讀 Storage、不碰 PDF、不寫進存檔或試養報告。
// 契約：docs/spec/10_居家環境健檢Worker契約.md §5.1。純函式＋一支 fetch 包裝（可注入 fetch 方便測試）。
import type { NodeId, Risk } from "./story";

export type HazardLevel = Risk["level"];

/** 判斷現在是不是「看完醫生回家、小叮嚀」那一步 */
export interface Year5MomentInput {
  step: string;
  nodeId: NodeId | null;
  /** 目前畫面上的東西（flow.ts 的 cur）；只看 kind 與台詞 */
  cur: { kind: string; lines?: readonly { t: string }[] } | null;
  sceneBg: string;
  /** 這一輪的劇情事件：year5 有 incident（送醫）或 scare（虛驚）才是意外那段 */
  events: readonly { node: NodeId; id: string }[];
  risk: Risk | null;
}

const TIP = "小叮嚀：";

/** year5 意外那段回到家（room）、正在顯示小叮嚀時成立：送醫是從醫院回家後、虛驚是在家觀察後；毛球（沒有危險項目）不算 */
export function year5HazardMoment(i: Year5MomentInput): boolean {
  if (i.step !== "node" || i.nodeId !== "year5" || !i.risk) return false;
  if (i.sceneBg !== "room" || i.cur?.kind !== "lines") return false;
  if (!i.events.some(e => e.node === "year5" && (e.id === "incident" || e.id === "scare"))) return false;
  return (i.cur.lines ?? []).some(l => l.t.startsWith(TIP));
}

/** 報告 API 回傳的單一項目（只取彈窗要的欄位） */
export interface ReportHazardItem {
  key: string;
  label: string;
  level: HazardLevel;
  note: string;
  /** 同源授權路由（Before＝風險裁切照）；示範報告、沒有裁切照時是 null */
  cropUrl: string | null;
  /** 示範報告（非真實 AI 分析） */
  demo: boolean;
}

const LEVELS = new Set(["high", "medium", "low"]);

/** 只接受本站 /api/homes/<喵戶>/reports/<報告>/crops/<key> 這種同源路由；其他網址一律丟掉（不信任外部 Blob 網址） */
export function safeCropUrl(url: unknown, householdId: string, reportId: string, key: string): string | null {
  if (typeof url !== "string") return null;
  const want = `/api/homes/${encodeURIComponent(householdId)}/reports/${encodeURIComponent(reportId)}/crops/${encodeURIComponent(key)}`;
  return url === want ? url : null;
}

/** 從報告 API 的回應挑出 key 對應的項目；報告沒發布（也不是示範）、找不到該項時回 null */
export function pickReportItem(body: unknown, householdId: string, reportId: string, key: string): ReportHazardItem | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { report?: { status?: unknown; published?: unknown; demo?: unknown }; items?: unknown };
  const r = b.report;
  if (!r || r.status !== "ready" || (r.published !== true && r.demo !== true)) return null;
  if (!Array.isArray(b.items)) return null;
  const row = b.items.find(x => x && typeof x === "object" && (x as { key?: unknown }).key === key) as Record<string, unknown> | undefined;
  if (!row || typeof row.label !== "string" || typeof row.note !== "string" || !LEVELS.has(String(row.level))) return null;
  const demo = r.demo === true;
  return {
    key, label: row.label, level: row.level as HazardLevel, note: row.note,
    cropUrl: demo ? null : safeCropUrl(row.cropUrl, householdId, reportId, key),
    demo,
  };
}

/** 讀玩家本人的報告，回傳這次意外那一項；任何失敗（沒登入 401、沒權限 404、網路）都回 null，由畫面改顯示文字版 */
export async function loadReportHazard(
  householdId: string, reportId: string, key: string,
  fetchImpl: typeof fetch = fetch, signal?: AbortSignal,
): Promise<ReportHazardItem | null> {
  try {
    const res = await fetchImpl(`/api/homes/${encodeURIComponent(householdId)}/reports/${encodeURIComponent(reportId)}`, {
      cache: "no-store", credentials: "same-origin", signal,
    });
    if (!res.ok) return null;
    return pickReportItem(await res.json(), householdId, reportId, key);
  } catch {
    return null;
  }
}

/**
 * 要讀哪一份報告：一律用這一輪開始時定格的 meow_task_runs.env_report_id（續玩也一樣），不讀最新那份。
 * 示範模式、沒登入、沒有喵戶、沒有進行中的紀錄或沒有定格報告 → null（不跳彈窗）。
 */
export function hazardReportTarget(i: { demo: boolean; signedIn: boolean; householdId: string | null; runReportId: string | null | undefined }): { householdId: string; reportId: string } | null {
  if (i.demo || !i.signedIn || !i.householdId || !i.runReportId) return null;
  return { householdId: i.householdId, reportId: i.runReportId };
}

/** 只有拿到這一項的真實裁切照才跳彈窗（示範報告、沒照片、對不上、讀不到都不跳） */
export function canShowHazard(item: ReportHazardItem | null | undefined): item is ReportHazardItem & { cropUrl: string } {
  return Boolean(item && !item.demo && item.cropUrl);
}

/** 彈窗要顯示的內容：risk＝劇情的那一項（advice＝小叮嚀原文）；item＝報告裡同一項（有才有照片與 note） */
export interface HazardDialogView {
  label: string;
  level: HazardLevel;
  /** 劇情原本的小叮嚀（不改字） */
  advice: string;
  /** 報告項目的說明；和小叮嚀一樣就不重複顯示 */
  note: string | null;
  /** Before：風險裁切照（同源路由）；null＝只顯示文字 */
  cropUrl: string | null;
  demo: boolean;
}

export function hazardDialogView(risk: Risk, item: ReportHazardItem | null): HazardDialogView {
  const note = item?.note.trim() || null;
  return {
    label: item?.label || risk.label,
    level: item?.level ?? risk.level,
    advice: risk.advice,
    note: note && note !== risk.advice.trim() ? note : null,
    cropUrl: item?.cropUrl ?? null,
    demo: item?.demo ?? false,
  };
}
