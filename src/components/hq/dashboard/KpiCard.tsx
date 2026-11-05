"use client";
// #226：卡片去來源／時間雜訊；來源改 ℹ️ tooltip；放大主數值、空狀態降權
import type { KpiValue } from "@/lib/hq/dashboard/types";
import { formatBytes, formatCount, formatMs, formatPercent } from "@/lib/hq/dashboard/format";

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
  const muted = kpi.status === "unavailable" || kpi.status === "empty" || kpi.status === "error";
  const status = statusLabel(kpi.status);
  return (
    <section className={`hq-tcard hq-kpi${muted ? " hq-kpi-mute" : ""}`} aria-label={title}>
      <header className="hq-kpi-head">
        <h2>{title}</h2>
        {kpi.source && (
          <button
            type="button"
            className="hq-kpi-info"
            title={`來源：${kpi.source}`}
            aria-label={`資料來源：${kpi.source}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 10v6M12 7h.01" />
            </svg>
          </button>
        )}
      </header>
      <div className={`hq-total${kpi.value == null || muted ? " zero" : ""}`}>{display}</div>
      {status && <p className={`hq-kpi-status${kpi.status === "error" ? " danger" : ""}`}>{status}</p>}
      {kpi.note && kpi.status !== "unavailable" && kpi.status !== "empty" && (
        <p className="hq-hint hq-kpi-note">{kpi.note}</p>
      )}
      {children}
    </section>
  );
}

function formatValue(kpi: KpiValue, format: Format): string {
  if (kpi.status === "unavailable" || kpi.status === "error") return "—";
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
