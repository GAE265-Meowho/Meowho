// MeowHQ｜喵星總部 — 處置操作規則（T-HQ-04）
// 依據：docs/hq/01 規格書 §4.6、§4.7、R8、R10、R11。
// 純函式：不依賴資料庫、畫面、React、Supabase。時間一律由呼叫端傳入 now，方便測試。
import { QUICK_REASONS, type HqDisposition } from "./types";

export type Check = { ok: true } | { ok: false; message: string };
export type ReasonCheck = { ok: true; reason: string } | { ok: false; message: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 解除停權時的提示（R8，UT-HQ-24）。 */
export const UNSUSPEND_NOTICE = "已婉拒的申請不會恢復";

/** 所有處置都必須填原因；空白字元（含全形空白、換行）也算空（UT-HQ-17～19）。 */
export function validateReason(_disposition: HqDisposition, reason: string | null | undefined): ReasonCheck {
  const trimmed = (reason ?? "").trim();
  return trimmed ? { ok: true, reason: trimmed } : { ok: false, message: "請填寫原因" };
}

/** 停權期限選項：7 天、30 天、直到手動解除。 */
export type SuspendDuration = "7d" | "30d" | "manual";

/** 依選項算出到期時間；直到手動解除回傳 null（UT-HQ-20）。 */
export function resolveSuspendUntil(duration: SuspendDuration, now: Date): Date | null {
  if (duration === "manual") return null;
  return new Date(now.getTime() + (duration === "7d" ? 7 : 30) * DAY_MS);
}

/** 轉成 Asia/Taipei 的 YYYY-MM-DD。 */
export function formatTaipeiDate(date: Date): string {
  return new Date(date.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/** 停權紀錄（只需要這幾個欄位）。until＝null 代表直到手動解除。 */
export interface SuspensionLike {
  until: Date | string | null;
  liftedAt?: Date | string | null;
}

/** 目前是否停權中（UT-HQ-21）：未解除，且沒有到期日或到期日在未來。 */
export function isSuspended(suspension: SuspensionLike | null | undefined, now: Date): boolean {
  if (!suspension) return false;
  if (suspension.liftedAt) return false;
  if (suspension.until === null) return true;
  const until = new Date(suspension.until).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/** R10：停權期限必須是未來；null（直到手動解除）不受限。 */
export function validateSuspendUntil(until: Date | string | null, now: Date): Check {
  if (until === null) return { ok: true };
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > now.getTime()
    ? { ok: true }
    : { ok: false, message: "停權期限必須是未來的時間" };
}

/** R11：已有生效中的停權時不能重複停權；要改期限須先解除再重新停權。 */
export function checkNotAlreadySuspended(current: SuspensionLike | null | undefined, now: Date): Check {
  return isSuspended(current, now)
    ? { ok: false, message: "此帳號已在停權中，請先解除停權再重新停權" }
    : { ok: true };
}

/** 停權前的影響說明（UT-HQ-22、23）；沒有審核中申請就不顯示。 */
export function getImpactMessage(pendingApplications: number): string | null {
  if (!Number.isFinite(pendingApplications) || pendingApplications <= 0) return null;
  return `將自動婉拒 ${pendingApplications} 筆審核中申請並通知對方`;
}

const normalizeEmail = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

/** 黑名單：輸入的 Email 須與帳號相符（去空白、不分大小寫）才能儲存（UT-HQ-25、26）。 */
export function confirmBanEmail(input: string | null | undefined, accountEmail: string | null | undefined): Check {
  const a = normalizeEmail(input);
  const b = normalizeEmail(accountEmail);
  return a && b && a === b ? { ok: true } : { ok: false, message: "Email 與此帳號不符" };
}

/** 快選原因清單（UT-HQ-28）；規格書未列的處置為空清單。 */
export function getQuickReasons(disposition: HqDisposition): readonly string[] {
  return QUICK_REASONS[disposition];
}

/** 快選標籤＋補充文字組成原因（UT-HQ-27）：「詐騙：補充文字」。 */
export function composeReason(quick: string | null | undefined, extra: string | null | undefined): string {
  const q = (quick ?? "").trim();
  const e = (extra ?? "").trim();
  if (q && e) return `${q}：${e}`;
  return q || e;
}
