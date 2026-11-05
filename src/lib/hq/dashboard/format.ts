// KPI 顯示用格式化（純函式）

/** bytes → 可讀字串（KB／MB／GB，最多 1 位小數） */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let n = bytes / 1024;
  for (let i = 0; i < units.length; i++) {
    if (n < 1024 || i === units.length - 1) {
      const digits = n >= 100 ? 0 : 1;
      return `${n.toFixed(digits)} ${units[i]}`;
    }
    n /= 1024;
  }
  return `${bytes} B`;
}

/** 0–1 或 0–100 → 百分比字串 */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  const pct = ratio <= 1 ? ratio * 100 : ratio;
  return `${pct.toFixed(digits)}%`;
}

/** 整數千分位（繁中環境用半形逗號） */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** 毫秒 → 可讀 */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** ISO → 台北時間短字串 */
export function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "尚無資料";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "尚無資料";
  return t.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}
