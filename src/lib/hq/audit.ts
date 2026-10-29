// 稽核日誌的顯示用文字（首頁「最近管理動作」、Admin 授權的稽核日誌頁共用）
import { ADMIN_MODULE_LABELS, type AdminModule } from "./types";

export const AUDIT_ACTIONS = ["suspend", "unsuspend", "revoke_grant", "revoke_badge", "takedown", "relist", "ban", "unban", "grant_module", "grant_badge", "set_role", "update_setting"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  suspend: "停權", unsuspend: "解除停權", revoke_grant: "撤銷模組授權", revoke_badge: "撤銷中途徽章",
  takedown: "下架", relist: "重新上架", ban: "加入黑名單", unban: "移出黑名單",
  grant_module: "授予模組", grant_badge: "授予中途徽章", set_role: "變更角色", update_setting: "變更網站設定",
};

const ROLE_LABELS: Record<string, string> = { system_admin: "系統管理員", admin: "管理員", member: "一般會員" };
export const roleLabel = (r: string | null | undefined) => ROLE_LABELS[r ?? ""] ?? "一般會員";

export interface AuditLog {
  id: number; actor_id: string; action: string; target_type: string; target_id: string; reason: string;
  detail: Record<string, unknown> | null; created_at: string;
}

/** 一行說明，例如「授予模組：商品」「變更角色：管理員 → 系統管理員」 */
export function describeAudit(log: Pick<AuditLog, "action" | "detail">): string {
  const label = AUDIT_ACTION_LABELS[log.action as AuditAction] ?? log.action;
  const d = log.detail ?? {};
  if ((log.action === "grant_module" || log.action === "revoke_grant") && typeof d.module === "string") {
    return `${label}：${ADMIN_MODULE_LABELS[d.module as AdminModule] ?? d.module}`;
  }
  if (log.action === "set_role") return `${label}：${roleLabel(d.from as string)} → ${roleLabel(d.to as string)}`;
  if (log.action === "update_setting" && typeof d.key === "string") return `${label}：${d.key === "logo" ? "網站 Logo" : d.key === "demo_speed" ? "Demo 加速模式" : d.key}`;
  return label;
}

/** 台北時間 YYYY/MM/DD HH:mm */
export function formatTaipei(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString();
  return `${t.slice(0, 4)}/${t.slice(5, 7)}/${t.slice(8, 10)} ${t.slice(11, 16)}`;
}
