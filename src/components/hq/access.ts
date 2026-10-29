// 外殼用的小工具：網址導向、登入閘門、側欄（側欄規則來自 src/lib/hq/permissions.ts）
import { getVisibleSidebar } from "@/lib/hq/permissions";
import { ADMIN_MODULES, HQ_ROLES, type AdminModule, type HqRole, type SidebarItem } from "@/lib/hq/types";

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

/** 側欄可見項目：依角色與授權（permissions.ts）；授權讀取中或失敗時（grants＝null）管理員只看到首頁 */
export function visibleSidebar(i: { role: string | null; grants: readonly AdminModule[] | null }): SidebarItem[] {
  const role = (HQ_ROLES as readonly string[]).includes(i.role ?? "") ? (i.role as HqRole) : null;
  if (!role) return [];
  return getVisibleSidebar({ role, modules: i.grants ?? [] });
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
