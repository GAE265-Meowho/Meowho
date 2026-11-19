// 前導影片分鏡表的頁面編修（#513）：畫面、旁白／字幕、音效（每鏡），中文 prompt（每格分鏡圖）。
// 原稿在 trailer.ts；meow_trailer_script_edits（0041）只存改動，同一格同一欄最新一筆生效，value 為 null＝還原原稿。
import { SHOT_SECTIONS, fullPrompt, type Frame, type Shot } from "./trailer";

export const SCRIPT_EDIT_TABLE = "meow_trailer_script_edits";
export type ShotField = "picture" | "voice" | "sfx";
export type EditField = ShotField | "zh_prompt";
export const SHOT_FIELDS: { field: ShotField; label: string }[] = [
  { field: "picture", label: "畫面" },
  { field: "voice", label: "旁白／字幕" },
  { field: "sfx", label: "音效" },
];
export const EDIT_MAX = 3000;

/** 鏡頭的穩定代號：取第一格分鏡圖代號去掉「-序號」（例：鏡 6 的第一格 s07-1 → s07），重新編號也不會變 */
export const shotKey = (shot: Pick<Shot, "frames">) => shot.frames[0].id.replace(/-\d+$/, "");

export type ScriptEdit = { id: string; target: string; field: EditField; value: string | null; created_at: string; author: string | null };
export type EffectiveEdit = { value: string; at: string; author: string | null; count: number };

/** 每一格每一欄的生效內容（最新一筆；最新是 null 就是還原，不列）；count＝這一欄被編修過幾次 */
export function effectiveEdits(edits: readonly ScriptEdit[]): Map<string, EffectiveEdit> {
  const latest = new Map<string, ScriptEdit>();
  const count = new Map<string, number>();
  for (const e of edits) {
    const k = `${e.target}:${e.field}`;
    count.set(k, (count.get(k) ?? 0) + 1);
    const prev = latest.get(k);
    if (!prev || e.created_at > prev.created_at) latest.set(k, e);
  }
  const out = new Map<string, EffectiveEdit>();
  for (const [k, e] of latest) if (e.value !== null) out.set(k, { value: e.value, at: e.created_at, author: e.author, count: count.get(k) ?? 1 });
  return out;
}

export const editKey = (target: string, field: EditField) => `${target}:${field}`;

/** 這一鏡某一欄目前顯示的內容：有編修用編修，沒有用原稿 */
export function shotValue(shot: Shot, field: ShotField, eff: Map<string, EffectiveEdit>): string {
  return eff.get(editKey(shotKey(shot), field))?.value ?? shot[field];
}

export function zhPromptOf(frame: Frame, eff: Map<string, EffectiveEdit>): string {
  return eff.get(editKey(frame.id, "zh_prompt"))?.value ?? "";
}

/** 寫入前整理：去頭尾空白；和原稿相同或空白（中文 prompt）就存 null＝還原 */
export function prepareEdit(target: string, field: EditField, value: string, original: string):
  | { ok: true; row: { target: string; field: EditField; value: string | null } }
  | { ok: false; message: string } {
  if (!/^s\d{2}(-\d)?$/.test(target)) return { ok: false, message: "找不到這一格" };
  const v = value.trim();
  if (v.length > EDIT_MAX) return { ok: false, message: `最多 ${EDIT_MAX} 字` };
  if (field !== "zh_prompt" && !v) return { ok: false, message: "不能空白；要回到原稿請按「還原原稿」" };
  return { ok: true, row: { target, field, value: v === original.trim() || !v ? null : v } };
}

/** 給 AI agent 的分鏡圖 prompt：英文（給生圖模型）＋中文補充（說明意圖與細節） */
export function agentPrompt(frame: Frame, line: Shot["line"], zh: string): string {
  const en = fullPrompt(frame, line);
  return zh.trim() ? `${en}\n\n【中文補充】\n${zh.trim()}` : en;
}

/** 匯出編修：列出每一鏡改過的欄位（原稿 → 目前），方便同步回 docs/video 原稿 */
export function editsMarkdown(eff: Map<string, EffectiveEdit>): string {
  const rows: string[] = [];
  for (const sec of SHOT_SECTIONS) for (const shot of sec.shots) {
    for (const { field, label } of SHOT_FIELDS) {
      const e = eff.get(editKey(shotKey(shot), field));
      if (e) rows.push(`| 鏡 ${shot.no} | ${label} | ${shot[field].replace(/\|/g, "／")} | ${e.value.replace(/\n/g, " ").replace(/\|/g, "／")} |`);
    }
    for (const f of shot.frames) {
      const e = eff.get(editKey(f.id, "zh_prompt"));
      if (e) rows.push(`| 鏡 ${shot.no}（${f.label ?? f.id}） | 中文 prompt | — | ${e.value.replace(/\n/g, " ").replace(/\|/g, "／")} |`);
    }
  }
  if (!rows.length) return "# 前導影片分鏡表編修\n\n目前沒有編修。\n";
  return ["# 前導影片分鏡表編修", "", "| 鏡頭 | 欄位 | 原稿 | 目前 |", "| --- | --- | --- | --- |", ...rows, ""].join("\n");
}
