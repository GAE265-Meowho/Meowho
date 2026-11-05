// 本機／server 結構化 API 指標（環形緩衝）。Vercel Observability 未設定時的備援。
// 不寫入資料庫、不含 request body／token／個資。
import type { MetricEvent } from "./aggregate";

const MAX = 500;
const events: MetricEvent[] = [];

export function recordApiMetric(ev: Omit<MetricEvent, "at"> & { at?: string }): void {
  events.push({ ...ev, at: ev.at ?? new Date().toISOString() });
  if (events.length > MAX) events.splice(0, events.length - MAX);
}

export function listApiMetrics(sinceMs: number): MetricEvent[] {
  if (sinceMs <= 0) return [];
  const cutoff = Date.now() - sinceMs;
  return events.filter(e => new Date(e.at).getTime() >= cutoff);
}

/** 測試用：清空 */
export function resetApiMetrics(): void {
  events.length = 0;
}
