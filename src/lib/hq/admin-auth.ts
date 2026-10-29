// Admin 授權模組的純函式（Issue #23，規格書 §4.3）
import { GRANTABLE_MODULES, type GrantableModule } from "./types";

export type GrantMap = Record<string, readonly string[]>;
export interface GrantChange { adminId: string; module: GrantableModule }

/** 比較授權矩陣前後差異；只看可授予模組，依管理員、模組固定順序輸出 */
export function diffGrants(before: GrantMap, after: GrantMap): { grants: GrantChange[]; revokes: GrantChange[] } {
  const grants: GrantChange[] = [];
  const revokes: GrantChange[] = [];
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const adminId of ids) {
    const was = new Set(before[adminId] ?? []);
    const now = new Set(after[adminId] ?? []);
    for (const m of GRANTABLE_MODULES as GrantableModule[]) {
      if (now.has(m) && !was.has(m)) grants.push({ adminId, module: m });
      if (was.has(m) && !now.has(m)) revokes.push({ adminId, module: m });
    }
  }
  return { grants, revokes };
}

/** 授權、角色、網站設定的快選原因（規格書 §4.7 未列，先用這組；可再調整） */
export const ADMIN_QUICK_REASONS = {
  grant: ["職務分工", "職務異動", "代理期間", "其他"],
  role: ["新進管理員", "職務異動", "離職", "其他"],
  setting: ["品牌更新", "Demo 準備", "活動期間", "其他"],
} as const;

export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] as const;

/** 上傳 Logo 前的檢查（與 bucket 設定一致：圖片、≤ 1 MB） */
export function validateLogoFile(f: { type: string; size: number }): { ok: true } | { ok: false; message: string } {
  if (!(LOGO_TYPES as readonly string[]).includes(f.type)) return { ok: false, message: "只接受 PNG、JPG、SVG、WebP" };
  if (f.size <= 0) return { ok: false, message: "檔案是空的" };
  if (f.size > LOGO_MAX_BYTES) return { ok: false, message: "檔案不能超過 1 MB" };
  return { ok: true };
}

/** Storage 路徑：logos/<時間戳>-<安全檔名>.<小寫副檔名> */
export function logoStoragePath(name: string, now: Date): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "logo";
  return `logos/${now.getTime()}-${base}${ext ? `.${ext}` : ""}`;
}
