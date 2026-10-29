// LLM 輸入防護（Issue #38，決策 004）：字數上限、使用者內容包進 <user_input>、系統指示附上防護規則。
// 純函式，前後端共用（前端顯示字數，後端再檢查一次）。
import { GUARD_RULES } from "@/lib/prompts/guard";

/** 上限集中在這裡，要調整只改一處（中文字數，以字元計） */
export const AI_LIMITS = {
  onboardingChars: 200, // 建檔每題回答、貓咪口述
  questionChars: 300, // 貓咪知識問答（之後的問答模組使用）
  turnsPerChat: 20, // 一次對話最多輪數（問答模組使用）
  callsPerDay: 50, // 每位會員每天呼叫次數（問答模組使用）
} as const;

/** 字數：以 Unicode 字元計，emoji 算 1 字 */
export const charCount = (text: string) => Array.from(text).length;

export type InputCheck = { ok: true; text: string } | { ok: false; error: string };

/** 檢查輸入：去頭尾空白、不可空白、不可超過上限（超過直接拒絕，不默默截斷） */
export function checkInput(raw: unknown, max: number): InputCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "請輸入內容" };
  const text = raw.trim();
  const n = charCount(text);
  if (n > max) return { ok: false, error: `內容太長了（${n} 字），請精簡到 ${max} 字以內` };
  return { ok: true, text };
}

/** 讓使用者無法偽造或提前結束資料區：移除內容中所有 user_input 標記（含全形角括號、大小寫、空白變化） */
export function neutralizeTags(text: string): string {
  return text.replace(/[<＜]\s*\/?\s*user_input\s*[>＞]/gi, "");
}

/** 把使用者內容包成資料區 */
export const wrapUserInput = (text: string) => `<user_input>\n${neutralizeTags(text)}\n</user_input>`;

/** 系統指示＋共用防護規則 */
export const withGuard = (system: string) => `${system.trimEnd()}\n${GUARD_RULES}`;
