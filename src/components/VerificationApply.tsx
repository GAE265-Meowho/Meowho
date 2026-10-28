"use client";
import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { VERIFICATION_LABEL, friendlyDbError, validateVerification, type VerificationInput, type VerificationStatus } from "@/lib/verification";
import { useAuth } from "./Auth";

export interface VerificationRow { id: string; household_id: string; status: VerificationStatus; review_note: string | null; created_at: string }

/** 貓戶的中途之家認證：已認證顯示徽章；否則可送出申請（管理員審核，FR-15-04） */
export function VerificationApply({ householdId, verified, latest, onSubmitted }: {
  householdId: string; verified: boolean; latest: VerificationRow | null; onSubmitted: (row: VerificationRow) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VerificationInput>({ orgType: "personal_foster", orgName: "", proofUrl: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (verified) return <span className="verified">🏅 認證中途之家</span>;
  if (latest?.status === "pending") return <span className="pill butter">🏅 中途之家認證{VERIFICATION_LABEL.pending}</span>;

  async function submit() {
    const errs = validateVerification(form);
    if (errs.length) { setError(errs.join("、")); return; }
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    setSending(true); setError(null);
    const { data, error: err } = await sb.from("shelter_verifications").insert({
      household_id: householdId, applicant_id: user.id, org_type: form.orgType,
      org_name: form.orgName.trim() || null, proof_url: form.proofUrl.trim() || null, description: form.description.trim(),
    }).select("id, household_id, status, review_note, created_at").single();
    setSending(false);
    if (err) { setError(friendlyDbError(err.message)); return; }
    setOpen(false);
    onSubmitted(data as VerificationRow);
  }

  if (!open) {
    return (
      <div className="verify-cta">
        {latest?.status === "rejected" && <p className="fine">上次申請未通過：{latest.review_note ?? "可補充資料後再次申請"}</p>}
        <button className="btn butter sm" onClick={() => setOpen(true)}>🏅 申請中途之家認證徽章</button>
      </div>
    );
  }

  const set = <K extends keyof VerificationInput>(k: K, v: VerificationInput[K]) => setForm(f => ({ ...f, [k]: v }));
  return (
    <section className="verify-form" aria-label="申請中途之家認證">
      <h3>🏅 申請中途之家認證</h3>
      <p className="fine">送出後由管理員審核，通過後徽章會顯示在你的貓戶上。</p>
      <div className="scope" role="radiogroup" aria-label="中途類型">
        {(["personal_foster", "shelter_org"] as const).map(t => (
          <button key={t} type="button" role="radio" aria-checked={form.orgType === t} className={form.orgType === t ? "on" : ""} onClick={() => set("orgType", t)}>
            {t === "personal_foster" ? "個人中途" : "立案協會／收容單位"}
          </button>
        ))}
      </div>
      {form.orgType === "shelter_org" && (
        <div className="field"><label htmlFor={`v-org-${householdId}`}>協會或單位名稱</label>
          <input id={`v-org-${householdId}`} value={form.orgName} maxLength={60} onChange={e => set("orgName", e.target.value)} /></div>
      )}
      <div className="field"><label htmlFor={`v-url-${householdId}`}>證明連結（粉專、官網、送養紀錄，選填）</label>
        <input id={`v-url-${householdId}`} type="url" inputMode="url" placeholder="https://" value={form.proofUrl} onChange={e => set("proofUrl", e.target.value)} /></div>
      <div className="field"><label htmlFor={`v-desc-${householdId}`}>說明你的中途經驗</label>
        <textarea id={`v-desc-${householdId}`} rows={3} maxLength={1000} placeholder="例如：在台中做個人中途 3 年，已送養 20 隻貓，目前照顧 6 隻" value={form.description} onChange={e => set("description", e.target.value)} /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>取消</button>
        <button className="btn sm" disabled={sending} onClick={submit}>{sending ? "送出中…" : "送出申請"}</button>
      </div>
    </section>
  );
}
