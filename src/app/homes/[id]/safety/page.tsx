"use client";
// v0.5：只列出已發布的 Worker 報告。摘要、裁切照、私有 PDF 皆經安全報告 API 讀取。
// 單獨檢測的 Azure 上傳仍待 #263/#274 整合；不得產生假 ready 報告。
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import s from "@/components/me/me.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { SAFETY_ONLY_PRIVACY, SHOOTING_TIPS, safetyRecords, type ReportRow } from "@/lib/home-room";
import { reportAttemptPrefix, validReportPdfPath } from "@/lib/home-safety/report-access";
import { SafetyReportDetails } from "./SafetyReportDetails";
import { getBrowserSupabase } from "@/lib/supabase/client";
import r from "../scene/scene.module.css";
import k from "./safety.module.css";

type Row = ReportRow & { summary: string | null; pdf_path: string | null; json_path: string | null; attempt: number | null };
const day = (iso: string) => new Date(iso).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });

export default function SafetyPage() {
  const { id } = useParams<{ id: string }>();
  const { loading, user, login } = useAuth();
  const sb = getBrowserSupabase();
  const [rows, setRows] = useState<Row[] | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [again, setAgain] = useState(false);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.from("meow_env_reports")
      .select("id, status, room_model_id, created_at, items, summary, pdf_path, json_path, attempt")
      .eq("household_id", id).order("created_at", { ascending: false });
    if (error) { setRows([]); return; }
    // Hide legacy "ready" demo rows that have no actual Worker result.json/PDF.
    // The report API checks the same contract before signing any private URL.
    setRows(((data ?? []) as Row[]).filter(row => {
      if (row.status !== "ready") return true;
      const prefix = reportAttemptPrefix(id, row.id, row.attempt);
      return validReportPdfPath(prefix, row.pdf_path)
        && prefix !== null && row.json_path === prefix + "result.json";
    }));
  }, [sb, id]);

  useEffect(() => {
    if (!sb) { setRows([]); return; }
    if (loading || !user) return;
    load();
  }, [loading, sb, user, load]);

  const records = rows ? safetyRecords(rows) : [];
  const busy = rows?.some(x => x.status === "queued" || x.status === "running") ?? false;
  const shown = records.find(x => x.id === picked) ?? records[0];

  let body: React.ReactNode;
  if (sb && !loading && !user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後檢查你家對貓安不安全</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login(window.location.pathname)}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (rows === undefined) body = <p className={f.lead} role="status">載入中…</p>;
  else if (busy && (again || !shown)) body = (
    <section className={`${f.card} ${f.center}`} role="status">
      <h2>正在產生你家的安全報告</h2>
      <p className={f.lead}>你可以先離開，好了會通知你。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
    </section>
  );
  else if (shown && !again) {
    body = (
      <>
        <section className={f.card} aria-labelledby="report-title">
          <h2 id="report-title">{day(shown.created_at)}的安全報告</h2>
          <p className={k.source}>{shown.source}・{shown.riskCount} 項風險觀察</p>
          <SafetyReportDetails householdId={id} reportId={shown.id} />
          <div className={f.actions}>
            {busy
              ? <CatButton disabled>安全檢測處理中</CatButton>
              : <CatButton onClick={() => setAgain(true)}><Icon name="check" size={18} />再檢測一次</CatButton>}
            <CatButton variant="ghost" href="/me">回到我的喵戶</CatButton>
          </div>
        </section>

        <section className={f.card} aria-labelledby="records-title">
          <h2 id="records-title">檢測紀錄（{records.length}）</h2>
          <ul className={k.records}>
            {records.map(x => (
              <li key={x.id}>
                <button type="button" className={k.record} aria-current={x.id === shown.id ? "true" : undefined} onClick={() => setPicked(x.id)}>
                  <span>{day(x.created_at)}</span>
                  <span>{x.source}</span>
                  <span>{x.riskCount} 項</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  }
  else body = (
    <>
      <section className={f.card} aria-labelledby="tips-title">
        <h2 id="tips-title">拍攝須知</h2>
        <ol className={r.tips}>
          {SHOOTING_TIPS.map((t, i) => (
            <li key={t.title}>
              <span className={r.num} aria-hidden="true">{i + 1}</span>
              <div><b>{t.title}</b><p>{t.body}</p></div>
            </li>
          ))}
        </ol>
      </section>

      {/* 單獨檢測前的說明是業務規則要求的聲明（決策 007），用一般內文字級 */}
      <p className={f.lead}>{SAFETY_ONLY_PRIVACY}</p>
      <p className={f.lead}>單獨上傳檢測仍在整合中，現在不會產生示範報告。請先從「我的 3D 房間」上傳影片，系統完成後可回到此頁查看安全報告。</p>
      <div className={f.actions}>
        <CatButton href={"/homes/" + id + "/scene"}><Icon name="video" size={18} />前往我的 3D 房間</CatButton>
      </div>
      {again && <div className={f.actions}><CatButton variant="ghost" onClick={() => setAgain(false)}>回到報告</CatButton></div>}
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>居家安全檢測</h1>
        {!sb && <p className={f.warn}>目前未連接資料庫，無法讀取或建立安全報告。</p>}
        {body}
      </main>
      <TabBar />
    </>
  );
}
