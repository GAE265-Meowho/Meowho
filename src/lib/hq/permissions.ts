// MeowHQ｜喵星總部 — 權限判斷（T-HQ-03）
// 依據：docs/hq/01 規格書 §3、§4.0、§4.7、R5、R7、R9；決策 003。
// 純函式：不依賴資料庫、畫面、React、Supabase。真正的安全邊界仍是資料庫 RLS 與 security definer 函式，
// 這裡的判斷用於畫面（顯示／鎖住）與測試，兩邊規則必須一致。
import {
  ADMIN_MODULES,
  HQ_SIDEBAR_ORDER,
  SYSTEM_ADMIN_ONLY_MODULES,
  type AdminModule,
  type HqErrorCode,
  type HqRole,
  type SidebarItem,
} from "./types";

/** 判斷權限所需的最小資訊：角色＋目前被授予的模組（系統管理員不需列出，視為全部）。 */
export interface HqActor {
  role: HqRole;
  modules: readonly AdminModule[];
}

/** 被操作的帳號。貓友、貓戶長都是 role＝member。 */
export type HqTarget = Pick<HqActor, "role">;

export type AccessResult = { allowed: true } | { allowed: false; error: Extract<HqErrorCode, "not_found" | "permission_changed"> };

export type RuleResult =
  | { allowed: true; revokesGrants?: boolean; note?: string }
  | { allowed: false; message: string };

const isSystemAdmin = (a: HqActor | null | undefined): boolean => a?.role === "system_admin";

/** 是否擁有某模組。系統管理員恆為 true；管理員只看授權；Admin 授權模組只屬於系統管理員。 */
export function hasModule(actor: HqActor | null | undefined, module: AdminModule): boolean {
  if (!actor) return false;
  if (actor.role === "system_admin") return true;
  if (actor.role !== "admin") return false;
  if ((SYSTEM_ADMIN_ONLY_MODULES as readonly AdminModule[]).includes(module)) return false;
  return actor.modules.includes(module);
}

/** 側欄可見項目（UT-HQ-01、02）：首頁＋有權限的模組，依固定順序。非管理員為空。 */
export function getVisibleSidebar(actor: HqActor | null | undefined): SidebarItem[] {
  if (!actor || (actor.role !== "system_admin" && actor.role !== "admin")) return [];
  return HQ_SIDEBAR_ORDER.filter((item) => item === "home" || hasModule(actor, item));
}

/** 進入模組頁面（UT-HQ-03）：沒有權限一律 not_found，不透露後台存在。 */
export function canAccessModule(actor: HqActor | null | undefined, module: AdminModule): AccessResult {
  return hasModule(actor, module) ? { allowed: true } : { allowed: false, error: "not_found" };
}

/** 操作當下以最新資料重新判斷（UT-HQ-04）：授權途中被撤銷 → permission_changed。 */
export function checkOperation(current: HqActor | null | undefined, module: AdminModule): AccessResult {
  return hasModule(current, module) ? { allowed: true } : { allowed: false, error: "permission_changed" };
}

/** 能否停權（UT-HQ-05～08，R7）。 */
export function canSuspend(actor: HqActor | null | undefined, target: HqTarget): RuleResult {
  if (!hasModule(actor, "user_management")) return { allowed: false, message: "沒有停權的權限" };
  if (target.role === "system_admin") return { allowed: false, message: "系統管理員不能被停權" };
  if (target.role === "admin") {
    if (!isSystemAdmin(actor)) return { allowed: false, message: "需由系統管理員處理" };
    return { allowed: true, revokesGrants: true, note: "同時收回所有模組授權" };
  }
  return { allowed: true };
}

/** 能否加入黑名單（UT-HQ-09，R9）：僅系統管理員；對象只能是貓友與貓戶長（一般會員），管理員與系統管理員須先撤銷身分。 */
export function canBan(actor: HqActor | null | undefined, target: HqTarget): RuleResult {
  if (!isSystemAdmin(actor)) return { allowed: false, message: "只有系統管理員可以加入黑名單" };
  if (target.role === "system_admin") {
    return { allowed: false, message: "系統管理員不能被加入黑名單，須先由另一位系統管理員撤銷其身分" };
  }
  if (target.role === "admin") {
    return { allowed: false, message: "黑名單只用於貓友與貓戶長，管理員須先撤銷身分" };
  }
  return { allowed: true };
}

/** 移除（撤銷身分）系統管理員前檢查（UT-HQ-10）。count＝目前系統管理員人數。 */
export function canRemoveSystemAdmin(systemAdminCount: number): RuleResult {
  return systemAdminCount > 1 ? { allowed: true } : { allowed: false, message: "至少要保留一位系統管理員" };
}

/** 授予模組給管理員（UT-HQ-11）：僅系統管理員；不可授予「Admin 授權」。 */
export function canGrantModule(actor: HqActor | null | undefined, module: AdminModule): RuleResult {
  if (!isSystemAdmin(actor)) return { allowed: false, message: "只有系統管理員可以授權" };
  if ((SYSTEM_ADMIN_ONLY_MODULES as readonly AdminModule[]).includes(module) || !ADMIN_MODULES.includes(module)) {
    return { allowed: false, message: "此模組不可授予管理員" };
  }
  return { allowed: true };
}

/** 撤銷模組授權：僅系統管理員。 */
export function canRevokeModuleGrant(actor: HqActor | null | undefined): RuleResult {
  return isSystemAdmin(actor) ? { allowed: true } : { allowed: false, message: "只有系統管理員可以撤銷授權" };
}
