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
