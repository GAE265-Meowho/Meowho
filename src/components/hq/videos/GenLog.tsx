"use client";
// 前導影片每一段的生成紀錄（#494）：段落標題旁的 (P) 按鈕，點開看歷史紀錄、新增一筆、再用一次、刪除。
// 資料表 meow_trailer_gen_logs（0038），權限繼承「影片」頁：所有管理員都能查看、新增、刪除。
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { useHqToast } from "@/components/hq/HqToast";
import { hqErrorMessage } from "@/components/hq/errors";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  EMPTY_DRAFT, GEN_LOG_LIMITS, GEN_LOG_TABLE, TOOL_SUGGESTIONS, draftFrom, formatLogTime, prepareGenLog,
  type GenLog, type GenLogDraft,
} from "@/lib/hq/videos/gen-log";
import type { ShotSection } from "@/lib/hq/videos/trailer";

type Row = Omit<GenLog, "author"> & { meow_profiles: { display_name: string | null; email: string | null } | null };

/** 一次載入全部紀錄（表很小），各段的 (P) 按鈕從這裡取 */
export function useGenLogs() {
  const { preview } = useHqActor();
  const [logs, setLogs] = useState<GenLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (preview || !sb) return;
    const { data, error: e } = await sb
      .from(GEN_LOG_TABLE)
      .select("id, section, tool, settings, inputs, prompt, negative_prompt, note, created_at, meow_profiles(display_name, email)")
      .order("created_at", { ascending: false });
    if (e) { setError(hqErrorMessage(e)); return; }
    setError(null);
    setLogs(((data ?? []) as unknown as Row[]).map(({ meow_profiles: p, ...r }) => ({
      ...r, settings: r.settings ?? "", inputs: r.inputs ?? "", negative_prompt: r.negative_prompt ?? "", note: r.note ?? "",
      author: p?.display_name || p?.email?.split("@")[0] || null,
    })));
  }, [preview]);
  useEffect(() => { void reload(); }, [reload]);
  return { logs, error, reload, available: !preview && Boolean(getBrowserSupabase()) };
}

export type GenLogsState = ReturnType<typeof useGenLogs>;

const FIELDS: { key: keyof GenLogDraft; label: string; multiline?: boolean; placeholder: string }[] = [
  { key: "tool", label: "工具", placeholder: "例：Kling 4.0" },
  { key: "settings", label: "模式與設定", placeholder: "例：Keyframes、10s、16:9、720p" },
  { key: "inputs", label: "用了哪些圖", placeholder: "例：首幀 s01、中間 s02、尾幀 s03" },
  { key: "prompt", label: "Prompt", multiline: true, placeholder: "貼上實際用的 prompt" },
  { key: "negative_prompt", label: "負面 prompt", multiline: true, placeholder: "有用才貼" },
  { key: "note", label: "結果備註", placeholder: "例：鏡頭沒越過箱頂，要再改" },
];

export function GenLogButton({ section, state, copy }: { section: Pick<ShotSection, "key" | "title" | "range">; state: GenLogsState; copy: (t: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const mine = state.logs.filter(l => l.section === section.key);
  return (
    <>
      <button type="button" className="hq-video-pbtn" aria-haspopup="dialog" aria-label={`${section.title}的生成紀錄，共 ${mine.length} 筆`}
        onClick={() => dialog.current?.showModal()}>
        (P){mine.length > 0 && <span className="hq-video-pcount">{mine.length}</span>}
      </button>
      <dialog ref={dialog} className="hq-video-dialog" aria-labelledby={titleId} onClick={e => { if (e.target === dialog.current) dialog.current?.close(); }}>
        <div className="hq-video-dialog-in">
          <header className="hq-row">
            <h2 id={titleId}>{section.title}（{section.range}）生成紀錄</h2>
            <button type="button" className="hq-btn ghost small" onClick={() => dialog.current?.close()}>關閉</button>
          </header>
          {!state.available ? <p className="hq-note">示範模式不能讀寫紀錄。</p> : <GenLogBody sectionKey={section.key} logs={mine} state={state} copy={copy} />}
        </div>
      </dialog>
    </>
  );
}

function GenLogBody({ sectionKey, logs, state, copy }: { sectionKey: ShotSection["key"]; logs: GenLog[]; state: GenLogsState; copy: (t: string) => void }) {
  const toast = useHqToast();
  const [draft, setDraft] = useState<GenLogDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<keyof GenLogDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const listId = useId();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = prepareGenLog(sectionKey, draft);
    if (!r.ok) { setErrors(r.errors); return; }
    const sb = getBrowserSupabase();
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.from(GEN_LOG_TABLE).insert(r.row);
    setBusy(false);
    if (error) { toast.show({ message: hqErrorMessage(error) }); return; }
    setDraft(EMPTY_DRAFT); setErrors({});
    toast.show({ message: "已新增紀錄" });
    await state.reload();
  }

  async function remove(log: GenLog) {
    if (!window.confirm(`刪除 ${formatLogTime(log.created_at)} 的這筆紀錄？刪除後無法復原。`)) return;
    const sb = getBrowserSupabase();
    if (!sb) return;
    const { error } = await sb.from(GEN_LOG_TABLE).delete().eq("id", log.id);
    if (error) { toast.show({ message: hqErrorMessage(error) }); return; }
    toast.show({ message: "已刪除" });
    await state.reload();
  }

  function reuse(log: GenLog) {
    setDraft(draftFrom(log)); setErrors({});
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      {state.error && <p className="hq-error" role="alert">{state.error}</p>}
      {logs.length === 0 ? <p className="hq-sub">這一段還沒有紀錄。</p> : (
        <ol className="hq-video-logs">
          {logs.map(l => (
            <li key={l.id} className="hq-video-log">
              <div className="hq-row hq-row-tight">
                <b>{l.tool}</b>
                <span className="hq-sub">{formatLogTime(l.created_at)}{l.author ? `・${l.author}` : ""}</span>
              </div>
              {l.settings && <p><span className="hq-sub">設定　</span>{l.settings}</p>}
              {l.inputs && <p><span className="hq-sub">用圖　</span>{l.inputs}</p>}
              <pre className="hq-video-logprompt" lang="en">{l.prompt}</pre>
              {l.negative_prompt && <details><summary className="hq-sub">負面 prompt</summary><pre className="hq-video-logprompt" lang="en">{l.negative_prompt}</pre></details>}
              {l.note && <p><span className="hq-sub">結果　</span>{l.note}</p>}
              <div className="hq-row hq-row-tight">
                <button type="button" className="hq-btn ghost small" onClick={() => copy(l.prompt)}>複製 prompt</button>
                <button type="button" className="hq-btn ghost small" onClick={() => reuse(l)}>再用一次</button>
                <button type="button" className="hq-btn ghost small" onClick={() => void remove(l)}>刪除</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form ref={formRef} className="hq-video-logform" onSubmit={e => void save(e)} noValidate>
        <h3 className="hq-h3">新增一筆</h3>
        <datalist id={listId}>{TOOL_SUGGESTIONS.map(t => <option key={t} value={t} />)}</datalist>
        {FIELDS.map(f => {
          const id = `${listId}-${f.key}`;
          const common = {
            id, value: draft[f.key], placeholder: f.placeholder, maxLength: GEN_LOG_LIMITS[f.key],
            "aria-invalid": Boolean(errors[f.key]) || undefined, "aria-describedby": errors[f.key] ? `${id}-err` : undefined,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(d => ({ ...d, [f.key]: e.target.value })),
          };
          return (
            <div key={f.key} className="hq-video-field">
              <label htmlFor={id}>{f.label}{(f.key === "tool" || f.key === "prompt") && <span aria-hidden="true">＊</span>}</label>
              {f.multiline ? <textarea rows={f.key === "prompt" ? 6 : 3} {...common} /> : <input type="text" list={f.key === "tool" ? listId : undefined} {...common} />}
              {errors[f.key] && <p id={`${id}-err`} className="hq-error">{errors[f.key]}</p>}
            </div>
          );
        })}
        <div className="hq-row hq-row-tight">
          <button type="submit" className="hq-btn" disabled={busy}>{busy ? "儲存中…" : "儲存紀錄"}</button>
          {draft !== EMPTY_DRAFT && <button type="button" className="hq-btn ghost" onClick={() => { setDraft(EMPTY_DRAFT); setErrors({}); }}>清空</button>}
        </div>
      </form>
    </>
  );
}
