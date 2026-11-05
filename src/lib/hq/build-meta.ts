// MeowHQ 頁尾：依功能／tab 顯示該區塊原始碼最後修改人與時間（page-meta.generated.json）
import generated from "./page-meta.generated.json";
import { resolvePageMetaKey, type HqPageMetaKey } from "./page-meta-map";

export type HqPageMeta = { key: HqPageMetaKey; updatedBy: string; versionDate: string };

/** Asia/Taipei → yyyy/mm/dd hh24:mi:ss */
export function formatHqVersionDate(at = new Date()): string {
  const s = at.toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }); // YYYY-MM-DD HH:mm:ss
  return s.replace(/-/g, "/");
}

function fallbackBy(): string {
  return process.env.NEXT_PUBLIC_HQ_UPDATED_BY || "unknown";
}

function fallbackDate(): string {
  return process.env.NEXT_PUBLIC_HQ_VERSION || formatHqVersionDate();
}

/** 全站 fallback（無對應 key／測試 stub 用） */
export function hqVersionDate(): string {
  return fallbackDate();
}

export function hqUpdatedBy(): string {
  return fallbackBy();
}

/** 依目前 pathname + search 查該功能／tab 的修改人與時間 */
export function hqPageMeta(pathname: string, search = ""): HqPageMeta {
  const key = resolvePageMetaKey(pathname, search);
  const hit = (generated as { pages?: Record<string, { updatedBy?: string; versionDate?: string }> }).pages?.[key];
  return {
    key,
    updatedBy: hit?.updatedBy || fallbackBy(),
    versionDate: hit?.versionDate || fallbackDate(),
  };
}
