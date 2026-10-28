"use client";
/* eslint-disable @next/next/no-img-element */
// 管理後台（隱藏網址，不出現在任何介面連結）。
// 真正的保護在資料庫：非管理員的 RLS 與函式都會拒絕，這裡的網址只是不公開。
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { useUi } from "@/components/Providers";
import { LOGOS } from "@/lib/mock-data";
import { CARETAKER_LABEL, type CaretakerType } from "@/lib/onboarding/household";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { VERIFICATION_LABEL, type VerificationStatus } from "@/lib/verification";

interface Pending {
  id: string; org_type: "personal_foster" | "shelter_org"; org_name: string | null; proof_url: string | null; description: string;
  status: VerificationStatus; review_note: string | null; created_at: string; reviewed_at: string | null;
  household: { id: string; name: string; city: string; district: string; intro: string; caretaker_type: CaretakerType; cat_count: number | null } | null;
  applicant: { display_name: string | null; email: string | null } | null;
}
interface Admin { id: string; display_name: string | null; email: string | null }
type Tab = "verify" | "admins" | "site";

export default function ConsolePage() {
  const { configured, loading, user, isAdmin, login } = useAuth();
  const [tab, setTab] = useState<Tab>("verify");

  if (!configured) return <Shell><p className="demo-note">尚未連接資料庫。</p></Shell>;
  if (loading) return <Shell><p className="sub center">載入中…</p></Shell>;
  if (!user) return <Shell><section className="profile-card center"><h2>管理後台</h2><button className="btn block" onClick={() => login(window.location.pathname)}>使用 Google 登入</button></section></Shell>;
  if (!isAdmin) return <Shell><section className="profile-card center"><h2>找不到頁面</h2><p className="sub">這個帳號沒有權限。</p></section></Shell>;

  return (
    <Shell>
      <h1 className="h2">🛠️ MeowHome 管理後台</h1>
      <div className="filters" role="tablist" aria-label="後台功能">
        {([["verify", "🏅 中途認證審核"], ["admins", "👤 管理員"], ["site", "🖼️ 網站標誌"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "verify" && <VerifyTab />}
      {tab === "admins" && <AdminsTab />}
      {tab === "site" && <SiteTab />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="wrap console">{children}</main>;
}

function VerifyTab() {
  const { toast } = useUi();
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const sb = getBrowserSupabase(); if (!sb) return;
    setRows(null);
    const { data, error } = await sb.from("meow_shelter_verifications")
      .select("id, org_type, org_name, proof_url, description, status, review_note, created_at, reviewed_at, household:meow_households(id, name, city, district, intro, caretaker_type, cat_count), applicant:meow_profiles!meow_shelter_verifications_applicant_id_fkey(display_name, email)")
      .eq("status", status).order("created_at", { ascending: status === "pending" });
    if (error) toast(`讀取失敗：${error.message}`);
    setRows((data ?? []) as unknown as Pending[]);
  }, [status, toast]);
  useEffect(() => { load(); }, [load]);

  async function review(id: string, approve: boolean) {
    const sb = getBrowserSupabase(); if (!sb) return;
    const { error } = await sb.rpc("meow_review_verification", { verification_id: id, approve, note: notes[id]?.trim() || null });
    if (error) { toast(`審核失敗：${error.message}`); return; }
    toast(approve ? "已核准，貓戶取得徽章並已通知申請人" : "已退回，並已通知申請人");
    load();
  }

  return (
    <section className="console-section">
      <div className="scope" role="radiogroup" aria-label="狀態">
        {(["pending", "approved", "rejected"] as VerificationStatus[]).map(s => (
          <button key={s} role="radio" aria-checked={status === s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{VERIFICATION_LABEL[s]}</button>
        ))}
      </div>
      {rows === null && <p className="sub">載入中…</p>}
      {rows?.length === 0 && <p className="sub">目前沒有{VERIFICATION_LABEL[status]}的申請。</p>}
      {rows?.map(r => (
        <article key={r.id} className="profile-card">
          <div className="badge-row">
            <span className="pill butter">{r.org_type === "shelter_org" ? "立案協會／收容單位" : "個人中途"}</span>
            {r.household && <span className="pill mint">{CARETAKER_LABEL[r.household.caretaker_type]}</span>}
            <span className="fine">{new Date(r.created_at).toLocaleString("zh-TW")}</span>
          </div>
          <h2>🏠 {r.household?.name ?? "（貓戶已刪除）"}{r.org_name ? `｜${r.org_name}` : ""}</h2>
          <p className="sub">📍 {r.household?.city}{r.household?.district}{r.household?.cat_count != null ? `｜照顧 ${r.household.cat_count} 隻貓` : ""}｜申請人：{r.applicant?.display_name ?? "—"}（{r.applicant?.email ?? "—"}）</p>
          <p style={{ margin: 0 }}><b>貓戶介紹：</b>{r.household?.intro}</p>
          <p style={{ margin: 0 }}><b>中途經驗：</b>{r.description}</p>
          {r.proof_url && <p style={{ margin: 0 }}><b>證明連結：</b><a href={r.proof_url} target="_blank" rel="noopener noreferrer nofollow">{r.proof_url}</a></p>}
          {r.status === "pending" ? (
            <>
              <div className="field"><label htmlFor={`note-${r.id}`}>給申請人的說明（選填）</label>
                <input id={`note-${r.id}`} value={notes[r.id] ?? ""} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} /></div>
              <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                <button className="btn ghost sm" onClick={() => review(r.id, false)}>退回</button>
                <button className="btn mint sm" onClick={() => review(r.id, true)}>核准並給徽章</button>
              </div>
            </>
          ) : <p className="fine">{VERIFICATION_LABEL[r.status]}{r.review_note ? `：${r.review_note}` : ""}</p>}
        </article>
      ))}
    </section>
  );
}

function AdminsTab() {
  const { toast } = useUi();
  const { user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    const sb = getBrowserSupabase(); if (!sb) return;
    const { data } = await sb.from("meow_profiles").select("id, display_name, email").eq("role", "admin").order("created_at");
    setAdmins((data ?? []) as Admin[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setAdmin(target: string, make: boolean) {
    const sb = getBrowserSupabase(); if (!sb || !target.trim()) return;
    const { data, error } = await sb.rpc("meow_set_admin", { target_email: target.trim(), make_admin: make });
    if (error) { toast(error.message); return; }
    if (data === "not_found") { toast("找不到這個 Email：對方需要先用 Google 登入 MeowHome 一次"); return; }
    toast(make ? "已授權為管理員" : "已移除管理員");
    setEmail(""); load();
  }

  return (
    <section className="console-section">
      <section className="profile-card">
        <h2>授權管理員</h2>
        <p className="fine">對方需要先用 Google 帳號登入過 MeowHome，才能被授權。</p>
        <form className="ask" onSubmit={e => { e.preventDefault(); setAdmin(email, true); }}>
          <label htmlFor="admin-email" className="sr">管理員 Email</label>
          <input id="admin-email" type="email" placeholder="name@gmail.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn sm" type="submit">授權</button>
        </form>
      </section>
      <ul className="notes">
        {admins.map(a => (
          <li key={a.id}><div className="admin-row">
            <span><b>{a.display_name ?? "—"}</b><small>{a.email}</small></span>
            {a.id !== user?.id && <button className="btn ghost sm" onClick={() => setAdmin(a.email ?? "", false)}>移除</button>}
          </div></li>
        ))}
      </ul>
    </section>
  );
}

function SiteTab() {
  const { logo, setLogo } = useUi();
  return (
    <section className="console-section">
      <section className="profile-card">
        <h2>網站標誌</h2>
        <p className="fine">選擇後立即套用到全站所有訪客。</p>
        <div className="logo-pick">
          {LOGOS.map(l => (
            <button key={l.id} type="button" className="logo-opt" aria-pressed={l.id === logo.id} onClick={() => setLogo(l.id)}>
              <img src={l.src} alt="" />{l.name}
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
