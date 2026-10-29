// 錯誤轉白話（規格書 §4.7）：畫面不顯示錯誤代碼。
import { HQ_ERROR_CODES } from "@/lib/hq/types";

export function friendlyError(code: unknown): string {
  if (code === "network") return "網路中斷，請再試一次";
  if (code === "permission_changed") return "你的權限已變更";
  return "發生問題，請稍後再試";
}

/** 從任意例外取出 HqErrorCode（沒有就回 undefined → 顯示未知訊息） */
export function errorCodeOf(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" && (HQ_ERROR_CODES as readonly string[]).includes(c) ? c : undefined;
}

const DB_MESSAGES: Record<string, string> = {
  reason_required: "請填寫原因",
  permission_denied: "你的權限已變更",
  need_system_admin: "需由系統管理員處理",
  not_found: "找不到資料",
};

/** 後台操作失敗的白話說明：優先用資料庫函式提供的 hint，其次已知代碼，網路錯誤另外判斷；不顯示錯誤代碼 */
export function hqErrorMessage(e: unknown): string {
  const err = (e ?? {}) as { message?: unknown; hint?: unknown; code?: unknown };
  if (typeof err.hint === "string" && err.hint.trim()) return err.hint;
  const msg = typeof err.message === "string" ? err.message : "";
  if (e instanceof TypeError || /failed to fetch|network/i.test(msg)) return friendlyError("network");
  if (DB_MESSAGES[msg]) return DB_MESSAGES[msg];
  return friendlyError(errorCodeOf(e));
}
