// MeowHQ｜用戶權限管理的資料整理（T-HQ-10，Issue #24）
// 純函式：頁面查好 meow_profiles／meow_households／meow_user_suspensions／meow_banlist／meow_shelter_verifications 後傳入。
// 後台角色（管理員、系統管理員）與前台身分（貓友、貓戶長）各自獨立：同一人可以同時是管理員與貓戶長。
import { isSuspended } from "./actions";
import { sortRows } from "./listing";
import type { HqRole } from "./types";

export interface ProfileRow { id: string; email: string | null; display_name: string | null; role: HqRole; created_at: string }
export interface HouseholdRow { id: string; owner_id: string; name: string; city: string; district: string; verified_shelter: boolean }
export interface SuspensionRow { user_id: string; reason: string; suspended_at: string; suspended_until: string | null; lifted_at: string | null }
export interface BanRow { google_email: string; auth_user_id: string | null; lifted_at: string | null }

export type Identity = "cat_friend" | "household_owner";
export type UserStatus = "normal" | "suspended" | "banned";

export interface UserView {
  id: string; email: string | null; name: string; role: HqRole; created_at: string;
  identity: Identity; households: HouseholdRow[];
  suspension: SuspensionRow | null;   // 生效中的停權
  banned: boolean;
  status: UserStatus;
}

export const IDENTITY_LABELS: Record<Identity, string> = { cat_friend: "貓友", household_owner: "貓戶長" };
export const STATUS_LABELS: Record<UserStatus, string> = { normal: "正常", suspended: "停權中", banned: "黑名單" };

/** 有貓戶＝貓戶長；沒有＝貓友 */
export const deriveIdentity = (householdCount: number): Identity => (householdCount > 0 ? "household_owner" : "cat_friend");

export function buildUserViews(
  profiles: readonly ProfileRow[], households: readonly HouseholdRow[],
  suspensions: readonly SuspensionRow[], bans: readonly BanRow[], now: Date,
): UserView[] {
  const openBans = bans.filter(b => !b.lifted_at);
  return profiles.map(p => {
    const hs = households.filter(h => h.owner_id === p.id);
    const suspension = suspensions.find(s => s.user_id === p.id && isSuspended({ until: s.suspended_until, liftedAt: s.lifted_at }, now)) ?? null;
    const email = (p.email ?? "").trim().toLowerCase();
    const banned = openBans.some(b => b.auth_user_id === p.id || (email !== "" && b.google_email === email));
    return {
      id: p.id, email: p.email, name: p.display_name || p.email || "（未命名）", role: p.role, created_at: p.created_at,
      identity: deriveIdentity(hs.length), households: hs, suspension, banned,
      status: banned ? "banned" : suspension ? "suspended" : "normal",
    };
  });
}

/** 帳號列表的篩選標籤（一列：身分＋狀態），值寫進網址 status 參數 */
export const USER_FILTERS = [
  { value: "cat_friend", label: "貓友" },
  { value: "household_owner", label: "貓戶長" },
  { value: "admin", label: "管理員" },
  { value: "suspended", label: "停權中" },
  { value: "banned", label: "黑名單" },
] as const;

export function filterUsers(views: readonly UserView[], f: { q?: string; status?: string }): UserView[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return views.filter(v => {
    if (q && !`${v.name} ${v.email ?? ""}`.toLowerCase().includes(q)) return false;
    switch (f.status) {
      case "cat_friend": case "household_owner": return v.identity === f.status;
      case "admin": return v.role === "admin" || v.role === "system_admin";
      case "suspended": return v.status === "suspended";
      case "banned": return v.status === "banned";
      default: return true;
    }
  });
}

// ---------- 中途認證 ----------
export interface VerificationRow {
  id: string; household_id: string; applicant_id: string; org_type: "personal_foster" | "shelter_org";
  org_name: string | null; proof_url: string | null; description: string;
  status: "pending" | "approved" | "rejected"; review_note: string | null; created_at: string; reviewed_at: string | null;
  household: { name: string; city: string; district: string; verified_shelter: boolean } | null;
}

export const VERIFICATION_FILTERS = [
  { value: "pending", label: "待審" },
  { value: "approved", label: "已核准" },
  { value: "rejected", label: "已退回" },
] as const;
export const VERIFICATION_STATUS_LABELS: Record<VerificationRow["status"], string> = { pending: "待審", approved: "已核准", rejected: "已退回" };
export const ORG_TYPE_LABELS: Record<VerificationRow["org_type"], string> = { personal_foster: "個人中途", shelter_org: "協會／單位" };
/** 退回的快選原因；「退回並要求補件」讓申請人補充後再申請 */
export const REJECT_QUICK_REASONS = ["退回並要求補件", "資料不符", "非中途性質", "其他"] as const;

/** 待審：等最久的在前；其他：最新的在前（§4.8） */
export function filterVerifications(rows: readonly VerificationRow[], f: { q?: string; status?: string }): VerificationRow[] {
  const q = (f.q ?? "").trim().toLowerCase();
  const list = rows.filter(r => (!f.status || r.status === f.status)
    && (!q || `${r.household?.name ?? ""} ${r.org_name ?? ""} ${r.household?.city ?? ""}${r.household?.district ?? ""}`.toLowerCase().includes(q)));
  return sortRows(list, f.status === "pending" ? "queue" : "latest");
}
