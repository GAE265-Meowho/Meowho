/** 角色（0002 之後多了 system_admin；0002 執行前資料庫只會有 member／admin）。 */
export type ProfileRole = "member" | "admin" | "system_admin";

/** 是否為管理員（Auth.tsx 的 isAdmin）：admin 或 system_admin。 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "system_admin";
}
