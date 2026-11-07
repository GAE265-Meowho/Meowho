"use client";

import { useEffect, useState } from "react";
import k from "./safety.module.css";

type RiskItem = {
  key: string;
  label: string;
  level: "high" | "medium" | "low";
  note: string;
  cropUrl: string | null;
};
type Result = {
  report: { id: string; status: string; published: boolean; error: string | null };
  summary: string | null;
  items: RiskItem[];
  warnings: Array<{ code?: string; message?: string }>;
  pdfUrl: string | null;
};
type View = { loading: true } | { loading: false; result: Result | null; error: string | null };
const LEVEL: Record<RiskItem["level"], string> = { high: "高風險", medium: "要注意", low: "低風險" };

export function SafetyReportDetails({ householdId, reportId }: { householdId: string; reportId: string }) {
  const [view, setView] = useState<View>({ loading: true });

  useEffect(() => {
    const ctrl = new AbortController();
    setView({ loading: true });
    fetch("/api/homes/" + encodeURIComponent(householdId) + "/reports/" + encodeURIComponent(reportId), {
      cache: "no-store", credentials: "same-origin", signal: ctrl.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("report_unavailable");
      return response.json() as Promise<Result>;
    }).then(result => {
      if (!ctrl.signal.aborted) setView({ loading: false, result, error: null });
    }).catch(() => {
      if (!ctrl.signal.aborted) setView({ loading: false, result: null, error: "安全報告暫時無法載入，請稍後再試。" });
    });
    return () => ctrl.abort();
  }, [householdId, reportId]);

  if (view.loading) return <p role="status">載入安全報告中…</p>;
  if (view.error || !view.result) return <p role="alert">{view.error ?? "安全報告無法讀取。"}</p>;
  const { report, items, summary, warnings, pdfUrl } = view.result;
  if (report.status === "failed") {
    return <p role="alert">{report.error ?? "安全檢測未完成，請重新上傳影片。"}</p>;
  }
  if (report.status !== "ready") return <p role="status">安全報告仍在處理中。</p>;
  if (!report.published) {
    return <p role="status">這筆是舊版示範或尚未正式發布的紀錄，沒有可驗證的 AI 分析成果。</p>;
  }

  return (
    <div className={k.details}>
      {summary && <p>{summary}</p>}
      {items.length === 0 ? <p>本次沒有提供可確認的風險項目；這不代表環境絕對安全。</p> : (
        <ul className={k.items}>
          {items.map(item => (
            <li key={item.key}>
              <div>
                <b>{item.label}</b>
                <span className={k.level}>{LEVEL[item.level]}</span>
              </div>
              {item.note && <p>{item.note}</p>}
              {item.cropUrl && (
                // Private Azure SAS only works until its expiry; reloading refreshes it.
                // eslint-disable-next-line @next/next/no-img-element
                <img className={k.crop} src={item.cropUrl} alt={item.label + "的風險裁切照"} referrerPolicy="no-referrer" loading="lazy" />
              )}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <div role="note">
          <b>辨識限制</b>
          <ul>{warnings.map((w, i) => <li key={w.code ?? i}>{w.message ?? "部分畫面仍需補拍確認。"}</li>)}</ul>
        </div>
      )}
      {pdfUrl && (
        <a className={k.pdfLink} href={pdfUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          看完整居家安全報告（PDF）
        </a>
      )}
      {!pdfUrl && <p className={k.source}>完整 PDF 只提供給喵戶本人；被分享者可查看風險摘要與裁切照。</p>}
      <p className={k.source}>這是輔助評估，不是獸醫診斷；AI 模擬改善不代表現場已完成改善。連結過期可重新載入頁面。</p>
    </div>
  );
}
