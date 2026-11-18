// 前導影片每一段的生成紀錄（#494）：記錄實際用的工具、設定、放了哪些圖、prompt。存在 meow_trailer_gen_logs（0038）。
// 權限繼承「影片」頁：所有管理員都能查看、新增、刪除；不能修改，要改就新增一筆，保留歷史。
import type { SectionKey } from "./trailer";

export const GEN_LOG_TABLE = "meow_trailer_gen_logs";

/** 工具欄位的建議選項（可自由輸入） */
export const TOOL_SUGGESTIONS = ["Kling 4.0", "Kling 3.0", "Dreamina Seedance 2.0", "Google Flow Veo 3.1", "Wan 2.2（本機）"];

/** 欄位上限，和 0038 的 check 一致 */
export const GEN_LOG_LIMITS = { tool: 80, settings: 200, inputs: 300, prompt: 6000, negative_prompt: 2000, note: 500 } as const;

export type GenLogDraft = {
  tool: string;
  settings: string;
  inputs: string;
  prompt: string;
  negative_prompt: string;
  note: string;
};

export type GenLog = GenLogDraft & { id: string; section: SectionKey; created_at: string; author: string | null };

export const EMPTY_DRAFT: GenLogDraft = { tool: "", settings: "", inputs: "", prompt: "", negative_prompt: "", note: "" };

/** 檢查並整理要寫進資料庫的內容：去頭尾空白、空字串轉 null；錯誤以欄位回傳 */
export function prepareGenLog(section: SectionKey, d: GenLogDraft):
  | { ok: true; row: { section: SectionKey; tool: string; prompt: string; settings: string | null; inputs: string | null; negative_prompt: string | null; note: string | null } }
  | { ok: false; errors: Partial<Record<keyof GenLogDraft, string>> } {
  const t = (v: string) => v.trim();
  const errors: Partial<Record<keyof GenLogDraft, string>> = {};
  if (!t(d.tool)) errors.tool = "請填工具";
  if (!t(d.prompt)) errors.prompt = "請貼上 prompt";
  for (const k of Object.keys(GEN_LOG_LIMITS) as (keyof GenLogDraft)[]) {
    if (!errors[k] && t(d[k]).length > GEN_LOG_LIMITS[k]) errors[k] = `最多 ${GEN_LOG_LIMITS[k]} 字`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const opt = (v: string) => (t(v) ? t(v) : null);
  return {
    ok: true,
    row: { section, tool: t(d.tool), prompt: t(d.prompt), settings: opt(d.settings), inputs: opt(d.inputs), negative_prompt: opt(d.negative_prompt), note: opt(d.note) },
  };
}

/** 「再用一次」：拿舊紀錄當新紀錄的草稿 */
export function draftFrom(log: GenLog): GenLogDraft {
  return { tool: log.tool, settings: log.settings ?? "", inputs: log.inputs ?? "", prompt: log.prompt, negative_prompt: log.negative_prompt ?? "", note: "" };
}

/** 顯示用時間：yyyy/mm/dd hh:mi（台北） */
export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}
