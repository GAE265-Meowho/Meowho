"use client";
import type { KpiValue } from "@/lib/hq/dashboard/types";
import { formatBytes, formatCount, formatMs, formatPercent, formatUpdatedAt } from "@/lib/hq/dashboard/format";

type Format = "count" | "bytes" | "percent" | "ms" | "raw";

export function KpiCard({
  title,
  kpi,
  format = "count",
  children,
}: {
  title: string;
  kpi: KpiValue;
  format?: Format;
  children?: React.ReactNode;
}) {
  const display = formatValue(kpi, format);
  const tone = kpi.status === "error" ? "danger" : kpi.status === "unavailable" || kpi.status === "empty" ? "mute" : "";
  return (
    <section className="hq-tcard hq-kpi" aria-label={title}>
      <h2>{title}</h2>
      <div className={`hq-total${kpi.value ? "" : " zero"}`}>{display}</div>
      {kpi.note && <p className="hq-hint">{kpi.note}</p>}
      {children}
      <footer className="hq-kpi-foot">
        {tone && <span className={`hq-tag ${tone}`}>{statusLabel(kpi.status)}</span>}
        <span className="hq-hint" title={kpi.source}>來源：{shortSource(kpi.source)}</span>
        <time className="hq-hint">{formatUpdatedAt(kpi.updatedAt)}</time>
      </footer>
    </section>
  );
}

function formatValue(kpi: KpiValue, format: Format): string {
  if (kpi.status === "unavailable" || kpi.status === "error") return kpi.note ? "—" : "—";
  if (kpi.value == null) return "—";
  switch (format) {
    case "bytes": return formatBytes(Number(kpi.value));
    case "percent": return formatPercent(Number(kpi.value));
    case "ms": return formatMs(Number(kpi.value));
    case "raw": return String(kpi.value);
    default: return formatCount(Number(kpi.value)) + (kpi.unit ? ` ${kpi.unit}` : "");
  }
}

function statusLabel(s: KpiValue["status"]): string {
  switch (s) {
    case "error": return "讀取失敗";
    case "unavailable": return "尚未啟用";
    case "empty": return "尚無資料";
    case "loading": return "載入中";
    default: return "";
  }
}

function shortSource(s: string): string {
  return s.length > 36 ? `${s.slice(0, 34)}…` : s;
}
