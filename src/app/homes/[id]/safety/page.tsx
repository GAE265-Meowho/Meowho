"use client";
// 居家安全檢測（規格 09 v0.6 §7.2、§8；#62）：
// - 有產生好的報告（喵戶卡片的「查看報告」）：顯示最新一份，下方列出檢測紀錄（日期、來源、風險項目數量），可點選看舊的；「再檢測一次」走單獨檢測。
// - 還沒有報告：單獨檢測的畫面，只做檢查、不建 3D 房間。
// ⚠ 單獨檢測的上傳與 AI 風險偵測後端還沒做：按鈕直接產生一份示範報告（/api/homes/[id]/safety，內容在 lib/home-room.ts）。
//   接上時：原始檔放私有 bucket `meow-home-videos`，伺服器建 `meow_env_reports`（room_model_id = null、status = 'queued'），
//   產生報告與風險裁切照（`meow-home-risk-crops`）後，成功或失敗都立即刪除原始檔（決策 007）。舊報告不覆蓋，每份都留成檢測紀錄。
// 報告只有本人讀得到（RLS），分享給中途要在對話串主動分享（meow_share_env_report）。
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import s from "@/components/me/me.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { SAFETY_ONLY_PRIVACY, SHOOTING_TIPS, demoReportRow, safetyRecords, type ReportRow } from "@/lib/home-room";
import { getBrowserSupabase } from "@/lib/supabase/client";
import r from "../scene/scene.module.css";
import k from "./safety.module.css";

type Row = ReportRow & { summary: string | null };
type Item = { key?: string; label?: string; level?: string; note?: string };

const LEVEL_LABEL: Record<string, string> = { high: "高風險", medium: "要注意", low: "低風險" };
const day = (iso: string) => new Date(iso).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });

export default function SafetyPage() {
  const { id } = useParams<{ id: string }>();
  const { loading, user, login } = useAuth();
  const sb = getBrowserSupabase();
  const [rows, setRows] = useState<Row[] | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [again, setAgain] = useState(false);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("meow_env_reports").select("id, status, room_model_id, created_at, items, summary").eq("household_id", id).order("created_at", { ascending: false });
    setRows((data ?? []) as Row[]);
  }, [sb, id]);

  useEffect(() => {
    if (!sb) { setRows([]); return; }
    if (loading || !user) return;
    load();
  }, [loading, sb, user, load]);

  // 「開始檢測」「上傳影片或照片」：目前直接產生示範報告，新報告加進檢測紀錄
  async function check() {
    setMaking(true); setError(null);
    if (!sb) {
      // 示範模式（沒有資料庫）：只在畫面上加一份
      setRows(v => [{ id: crypto.randomUUID(), ...demoReportRow(id, null, new Date()) }, ...(v ?? [])]);
    } else {
      const res = await fetch(`/api/homes/${id}/safety`, { method: "POST" }).then(x => x.json()).catch(() => null);
      if (!res?.reportId) { setError("安全檢測失敗，請再試一次。"); setMaking(false); return; }
      await load();
    }
    setPicked(null); setAgain(false); setMaking(false);
  }

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
  else if (making || (busy && (again || !shown))) body = (
    <section className={`${f.card} ${f.center}`} role="status">
      <h2>正在產生你家的安全報告</h2>
      <p className={f.lead}>你可以先離開，好了會通知你。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
    </section>
  );
  else if (shown && !again) {
    const items = (Array.isArray(shown.items) ? shown.items : []) as Item[];
    body = (
      <>
        <section className={f.card} aria-labelledby="report-title">
          <h2 id="report-title">{day(shown.created_at)}的安全報告</h2>
          <p className={k.source}>{shown.source}・{shown.riskCount ? `${shown.riskCount} 個要注意的地方` : "沒有發現要注意的地方"}</p>
          {shown.summary && <p className={f.lead}>{shown.summary}</p>}
          {items.length > 0 && (
            <ul className={k.items}>
              {items.map((it, i) => (
                <li key={it.key ?? i}>
                  <b>{it.label ?? "風險項目"}</b>
                  {it.level && LEVEL_LABEL[it.level] && <span className={k.level}>{LEVEL_LABEL[it.level]}</span>}
                  {it.note && <p>{it.note}</p>}
                </li>
              ))}
            </ul>
          )}
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
      {error && <p className={f.error} role="alert">{error}</p>}
      {/* 錄影、上傳還沒接：兩個按鈕都直接產生示範報告 */}
      <div className={f.actions}>
        <CatButton onClick={check}><Icon name="video" size={18} />開始檢測</CatButton>
        <CatButton variant="ghost" onClick={check}><Icon name="plus" size={18} />上傳影片或照片</CatButton>
      </div>
      {again && <div className={f.actions}><CatButton variant="ghost" onClick={() => setAgain(false)}>回到報告</CatButton></div>}
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>居家安全檢測</h1>
        {!sb && <p className={f.warn}>示範模式：還沒連接資料庫，報告不會儲存。</p>}
        {body}
      </main>
      <TabBar />
    </>
  );
}
