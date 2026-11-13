"use client";
// 放棄領養任務：理由必選（可複選），「其他」要填寫。放棄標籤只有這隻貓的中途看得到，領養人自己的畫面不顯示。
// 從原本的 /cats/[id]/run 搬來（/run 併進 /play，見 docs/play-tasks/7-進行中續玩放棄重玩.md）；放棄原因 ABANDON_REASONS 沿用。
import { useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Required from "@/components/ui/Required";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ABANDON_REASONS, abandonMissing } from "@/lib/task-run";
import s from "./abandon.module.css";
import { notifyRunChanged } from "./useActiveRun";

export function AbandonPanel({ catName, runId, onCancel, onDone }: { catName: string; runId: string; onCancel: () => void; onDone: () => void }) {
  const sb = getBrowserSupabase();
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = abandonMissing(reasons, note);

  async function submit() {
    setTried(true);
    if (missing || !sb) return;
    setBusy(true);
    const { error: err } = await sb.rpc("meow_abandon_task_run", { p_run_id: runId, p_reasons: reasons, p_note: note.trim() || null });
    setBusy(false);
    if (err) { setError(`放棄失敗：${err.message}`); return; }
    notifyRunChanged();
    onDone();
  }

  return (
    <section className={f.card} role="dialog" aria-labelledby="abandon-title">
      <h2 id="abandon-title">要放棄{catName}的領養任務嗎？</h2>
      <p className={f.lead}>放棄後，{catName}的中途會看到你放棄過這隻貓的領養任務，以及你選的原因。</p>
      <fieldset className={s.reasons}>
        <legend className={f.label}>放棄的原因（可以複選）<Required /></legend>
        {ABANDON_REASONS.map(r => (
          <label key={r.key} className={s.check}>
            <input type="checkbox" checked={reasons.includes(r.key)}
              onChange={e => setReasons(v => (e.target.checked ? [...v, r.key] : v.filter(x => x !== r.key)))} />{r.label}
          </label>
        ))}
      </fieldset>
      {reasons.includes("other") && (
        <div className={f.field}>
          <label className={f.label} htmlFor="abandon-note">其他原因<Required /></label>
          <textarea id="abandon-note" rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
        </div>
      )}
      {tried && missing && <p className={f.error} role="alert">{missing}</p>}
      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions}>
        <CatButton disabled={busy} onClick={submit}>{busy ? "處理中…" : "確認放棄"}</CatButton>
        <CatButton variant="ghost" onClick={onCancel}>繼續任務</CatButton>
      </div>
    </section>
  );
}
