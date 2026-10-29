// ⚠️ STUB：待 #20（src/lib/hq/permissions.ts）合併後，visibleSidebar 改接真正的權限判斷。
// 這裡只做「外殼要顯示哪些側欄項目」的最小判斷，不是完整權限規則（不做 canSuspend 等）。
import { ADMIN_MODULES, HQ_SIDEBAR_ORDER, SYSTEM_ADMIN_ONLY_MODULES, type AdminModule, type SidebarItem } from "@/lib/hq/types";

/** /meowhq、/MEOWHQ 等大小寫不同的寫法 → 回傳正確網址（保留子路徑與參數）；不需導向回 null（UT-HQ-12）。 */
export function hqRedirectTarget(pathname: string, search: string): string | null {
  const m = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!m || m[1].toLowerCase() !== "meowhq" || m[1] === "MeowHQ") return null;
  return `/MeowHQ${m[2] ?? ""}${search}`;
}

export type GateState = "loading" | "login" | "not_found" | "ok";
/** 登入閘門（UT-HQ-13、14）：role 是 meow_profiles.role 原值（0002 前只有 member／admin）。 */
export function resolveGate(i: { configured: boolean; loading: boolean; signedIn: boolean; role: string | null }): GateState {
  if (i.loading) return "loading";
  if (!i.signedIn) return "login";
  return i.role === "admin" || i.role === "system_admin" ? "ok" : "not_found";
}

/**
 * 側欄可見項目。
 * - system_admin：全部。admin：首頁＋被授權模組（不含系統管理員專屬）。其他：空。
 * - grants 為 null＝讀不到授權表（0002 尚未執行、資料庫仍是舊結構）→ 退回示範資料：當作全部模組可見
 *   （舊結構的 admin 本來就能做所有後台事，0002 會把他們升為 system_admin）。
 */
export function visibleSidebar(i: { role: string | null; grants: readonly AdminModule[] | null }): SidebarItem[] {
  if (i.role !== "admin" && i.role !== "system_admin") return [];
  const all = i.role === "system_admin" || i.grants === null;
  const only = SYSTEM_ADMIN_ONLY_MODULES as readonly AdminModule[];
  return HQ_SIDEBAR_ORDER.filter(item => item === "home" || (all ? true : !only.includes(item) && i.grants!.includes(item)));
}

export const HQ_HOME = "/MeowHQ";
/** 側欄連結（階段 2 實作各頁時若網址不同再調整） */
export const HQ_MODULE_PATH: Record<AdminModule, string> = {
  report_moderation: "/MeowHQ/reports",
  user_management: "/MeowHQ/users",
  products: "/MeowHQ/products",
  knowledge: "/MeowHQ/knowledge",
  virtual_assets: "/MeowHQ/assets",
  admin_authorization: "/MeowHQ/admin",
};
export const isModule = (x: SidebarItem): x is AdminModule => (ADMIN_MODULES as readonly string[]).includes(x);
