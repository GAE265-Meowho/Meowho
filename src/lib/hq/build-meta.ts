// MeowHQ 頁尾建置資訊（建置時寫入 NEXT_PUBLIC_*；Asia/Taipei）

/** Asia/Taipei → yyyy/mm/dd hh24:mi:ss */
export function formatHqVersionDate(at = new Date()): string {
  const s = at.toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }); // YYYY-MM-DD HH:mm:ss
  return s.replace(/-/g, "/");
}

export function hqVersionDate(): string {
  return process.env.NEXT_PUBLIC_HQ_VERSION || formatHqVersionDate();
}

export function hqUpdatedBy(): string {
  return process.env.NEXT_PUBLIC_HQ_UPDATED_BY || "unknown";
}
