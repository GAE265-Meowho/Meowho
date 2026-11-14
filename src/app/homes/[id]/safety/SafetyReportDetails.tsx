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
  report: { id: string; status: string; published: boolean; demo?: boolean; error: string | null };
  summary: string | null;
  items: RiskItem[];
  warnings: Array<{ code?: string; message?: string }>;
  pdfUrl: string | null;
};
type View = { loading: true } | { loading: false; result: Result | null; error: string | null; html: "available" | "missing" | "unavailable" };
const LEVEL: Record<RiskItem["level"], string> = { high: "高風險", medium: "要注意", low: "低風險" };

export function SafetyReportDetails({ householdId, reportId, summaryOnly = false }: { householdId: string; reportId: string; summaryOnly?: boolean }) {
  const [view, setView] = useState<View>({ loading: true });

  const reportEndpoint = "/api/homes/" + encodeURIComponent(householdId) + "/reports/" + encodeURIComponent(reportId);
  const htmlEndpoint = reportEndpoint + "/html";

  useEffect(() => {
    const ctrl = new AbortController();
    setView({ loading: true });
    fetch(reportEndpoint, {
      cache: "no-store", credentials: "same-origin", signal: ctrl.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("report_unavailable");
      return response.json() as Promise<Result>;
    }).then(async result => {
      let html: "available" | "missing" | "unavailable" = "missing";
      if (!summaryOnly && result.report.status === "ready" && result.report.published && !result.report.demo && result.pdfUrl) {
        html = await fetch(htmlEndpoint, {
          method: "HEAD", cache: "no-store", credentials: "same-origin", signal: ctrl.signal,
        }).then(response => response.status === 204 ? "available" as const
          : response.status === 404 ? "missing" as const : "unavailable" as const)
          .catch(() => "unavailable" as const);
      }
      if (!ctrl.signal.aborted) setView({ loading: false, result, error: null, html });
    }).catch(() => {
      if (!ctrl.signal.aborted) setView({ loading: false, result: null, html: "unavailable", error: "安全報告暫時無法載入，請稍後再試。" });
    });
    return () => ctrl.abort();
  }, [reportEndpoint, htmlEndpoint, summaryOnly]);

  if (view.loading) return <p role="status">載入安全報告中…</p>;
  if (view.error || !view.result) return <p role="alert">{view.error ?? "安全報告無法讀取。"}</p>;
  const { report, items, summary, warnings, pdfUrl } = view.result;
  if (report.status === "failed") {
    return <p role="alert">{report.error ?? "安全檢測未完成，請重新上傳影片。"}</p>;
  }
  if (report.status !== "ready") return <p role="status">安全報告仍在處理中。</p>;
  if (!report.published && !report.demo) {
    return <p role="status">這筆報告尚未發布完整的 AI 分析成果，暫時無法查看。</p>;
  }

  // PDF links use the same-origin route, which rechecks ownership and requests
  // a fresh short-lived URL only after the user chooses an action.
  const pdfEndpoint = reportEndpoint + "/pdf";

  if (view.html === "available") {
    return <a className={k.pdfLink} href={htmlEndpoint}>查看報告</a>;
  }

  return (
    <div className={k.details}>
      {report.demo && <p role="note"><b>示範報告（非真實 AI 分析）</b>：以下內容是預設範例，不代表你的居家環境已完成檢測。</p>}
      <p className={k.summary}>{summary || "尚未提供文字摘要，請參考下方風險項目。"}</p>
      {view.html === "unavailable" && <p role="status">完整圖文報告暫時無法載入，目前顯示摘要。</p>}
      {items.length === 0 ? <p>本次沒有提供可確認的風險項目；這不代表環境絕對安全。</p> : (
        <ul className={k.items}>
          {items.map(item => (
            <li key={item.key}>
              <div>
                <b>{item.label}</b>
                <span className={k.level}>{LEVEL[item.level]}</span>
              </div>
              {item.note && <p>{item.note}</p>}
              {item.cropUrl && <ReportCrop key={item.key} item={item} />}
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
      {!pdfUrl && !report.demo && <p className={k.source}>完整 PDF 只提供給喵戶本人；被分享者可查看風險摘要與裁切照。</p>}
      {report.demo && <p className={k.source}>示範資料不含裁切照或 PDF。真實報告需由上傳影片後的 WelfareLens Worker 產生。</p>}
      <p className={k.source}>本報告提供居家安全參考。AI 模擬圖片呈現建議做法，實際改善仍需現場確認。</p>
      {report.published && pdfUrl && (
        <section className={k.pdfActions} aria-label="完整 PDF">
          <a className={k.pdfLink} href={pdfEndpoint + "?download=1"} target="_blank"
            rel="noopener noreferrer" referrerPolicy="no-referrer">下載完整 PDF 報告</a>
          <p className={k.source}>手機若仍以預覽開啟，請從分享選單儲存。</p>
        </section>
      )}

    </div>
  );
}

function ReportCrop({ item }: { item: RiskItem }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  if (failed) return <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>裁切照載入失敗，點此重新載入</button>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={attempt} className={k.crop} src={item.cropUrl ?? undefined} alt={item.label + "的風險裁切照"}
      referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} />
  );
}
