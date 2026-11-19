"use client";
// 分鏡表的頁面編修（#513）：畫面、旁白／字幕、音效、中文 prompt。存 meow_trailer_script_edits（0041），只存改動，最新一筆生效。
// 權限繼承「影片」頁：管理員可以編修、還原；每次編修都留下紀錄（誰、何時）。
import { useCallback, useEffect, useId, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { useHqToast } from "@/components/hq/HqToast";
import { hqErrorMessage } from "@/components/hq/errors";
import { formatLogTime } from "@/lib/hq/videos/gen-log";
import {
  EDIT_MAX, SCRIPT_EDIT_TABLE, editKey, editsMarkdown, effectiveEdits, prepareEdit,
  type EditField, type EffectiveEdit, type ScriptEdit,
} from "@/lib/hq/videos/script-edits";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Row = Omit<ScriptEdit, "author"> & { meow_profiles: { display_name: string | null; email: string | null } | null };

export function useScriptEdits() {
  const { preview } = useHqActor();
  const [eff, setEff] = useState<Map<string, EffectiveEdit>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const available = !preview && Boolean(getBrowserSupabase());
  const reload = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (preview || !sb) return;
    const { data, error: e } = await sb.from(SCRIPT_EDIT_TABLE)
      .select("id, target, field, value, created_at, meow_profiles(display_name, email)")
      .order("created_at", { ascending: true });
    if (e) { setError(hqErrorMessage(e)); return; }
    setError(null);
    setEff(effectiveEdits(((data ?? []) as unknown as Row[]).map(({ meow_profiles: p, ...r }) => ({
      ...r, author: p?.display_name || p?.email?.split("@")[0] || null,
    }))));
  }, [preview]);
  useEffect(() => { void reload(); }, [reload]);
  return { eff, error, available, reload };
}

export type ScriptEditsState = ReturnType<typeof useScriptEdits>;

/** 可編修的一段文字：平常顯示內容，按「編修」變成輸入框；改過的會標「已編修」，可還原原稿 */
export function EditableText({ target, field, label, original, state, placeholder, emptyText }: {
  target: string; field: EditField; label: string; original: string; state: ScriptEditsState;
  placeholder?: string; emptyText?: string;
}) {
  const toast = useHqToast();
  const id = useId();
  const e = state.eff.get(editKey(target, field));
  const value = e?.value ?? original;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function write(next: string) {
    const r = prepareEdit(target, field, next, original);
    if (!r.ok) { setMsg(r.message); return; }
    const sb = getBrowserSupabase();
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.from(SCRIPT_EDIT_TABLE).insert(r.row);
    setBusy(false);
    if (error) { setMsg(hqErrorMessage(error)); return; }
    setMsg(null); setEditing(false);
    toast.show({ message: r.row.value === null ? `已還原：${label}` : `已儲存：${label}` });
    await state.reload();
  }

  if (editing) {
    return (
      <div className="hq-video-edit">
        <label htmlFor={id} className="hq-sub">編修{label}</label>
        <textarea id={id} rows={field === "zh_prompt" ? 4 : 3} value={draft} maxLength={EDIT_MAX} placeholder={placeholder}
          onChange={ev => setDraft(ev.target.value)} aria-invalid={Boolean(msg) || undefined} aria-describedby={msg ? `${id}-err` : undefined} />
        {msg && <p id={`${id}-err`} className="hq-error">{msg}</p>}
        <div className="hq-row hq-row-tight">
          <button type="button" className="hq-btn small" disabled={busy} onClick={() => void write(draft)}>{busy ? "儲存中…" : "儲存"}</button>
          <button type="button" className="hq-btn ghost small" disabled={busy} onClick={() => { setEditing(false); setMsg(null); }}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <div className="hq-video-editview">
      {value ? <span className="hq-video-edittext">{value}</span> : <span className="hq-sub">{emptyText ?? "—"}</span>}
      <span className="hq-video-editmeta">
        {e && <span className="hq-video-edited" title={`編修 ${e.count} 次`}>已編修・{e.author ?? "管理員"}・{formatLogTime(e.at)}</span>}
        {state.available && (
          <button type="button" className="hq-video-editbtn" aria-label={`編修${label}`} onClick={() => { setDraft(value); setEditing(true); }}>編修</button>
        )}
        {state.available && e && field !== "zh_prompt" && (
          <button type="button" className="hq-video-editbtn" disabled={busy} onClick={() => { if (window.confirm(`把「${label}」還原成原稿？`)) void write(original); }}>還原原稿</button>
        )}
      </span>
    </div>
  );
}

/** 匯出目前的編修（原稿 → 目前），讓人同步回 docs/video 原稿 */
export function ExportEdits({ state }: { state: ScriptEditsState }) {
  if (!state.available || state.eff.size === 0) return null;
  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([editsMarkdown(state.eff)], { type: "text/markdown;charset=utf-8" }));
    a.download = "前導影片分鏡表編修.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return <button type="button" className="hq-btn ghost small" onClick={download}>匯出編修（{state.eff.size} 處）</button>;
}
