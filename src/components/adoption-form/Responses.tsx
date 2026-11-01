"use client";
/* eslint-disable @next/next/no-img-element */
// 中途看這隻貓收到的問卷（#89）：只列送出的回覆；照片在私人 bucket，用短時效網址顯示。
import { useEffect, useState } from "react";
import type { Answers, Question } from "@/lib/adoption-form/questionnaire";
import { getBrowserSupabase } from "@/lib/supabase/client";
import f from "../onboarding/intake.module.css";
import { RESPONSE_STATUS, answerText, type ResponseStatus } from "./answer-text";
import s from "./form.module.css";

export const ADOPTION_PHOTO_BUCKET = "meow-adoption-photos";

interface Row { id: string; respondent_name: string | null; status: ResponseStatus; submitted_at: string | null; answers: Answers; photo_paths: string[] }

export function Responses({ formId, questions }: { formId: string; questions: Question[] }) {
  const sb = getBrowserSupabase();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!sb) return;
    sb.from("meow_adoption_responses").select("id, respondent_name, status, submitted_at, answers, photo_paths")
      .eq("form_id", formId).neq("status", "draft").order("submitted_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, [sb, formId]);

  async function expand(r: Row) {
    setOpen(open === r.id ? null : r.id);
    if (!sb || !r.photo_paths.length) return;
    const { data } = await sb.storage.from(ADOPTION_PHOTO_BUCKET).createSignedUrls(r.photo_paths, 3600);
    setPhotos(p => ({ ...p, ...Object.fromEntries((data ?? []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])) }));
  }

  async function setStatus(r: Row, status: ResponseStatus) {
    if (!sb) return;
    const { error } = await sb.from("meow_adoption_responses").update({ status }).eq("id", r.id);
    if (!error) setRows(list => (list ?? []).map(x => (x.id === r.id ? { ...x, status } : x)));
  }

  if (!rows) return <p className={f.lead} role="status">回覆載入中…</p>;
  return (
    <div className={s.section}>
      <h3>收到的問卷（{rows.length}）</h3>
      {rows.length === 0 && <p className={f.lead}>還沒有人填寫。</p>}
      <ul className={s.responses}>
        {rows.map(r => (
          <li key={r.id} className={s.response}>
            <button type="button" className={s.responseHead} aria-expanded={open === r.id} onClick={() => expand(r)}>
              <b>{r.respondent_name || "會員"}</b>
              <span>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString("zh-TW") : ""}</span>
              <span className={s.badge}>{RESPONSE_STATUS[r.status]}</span>
            </button>
            {open === r.id && (
              <div className={s.responseBody}>
                <dl className={s.answers}>
                  {questions.filter(q => q.type !== "note").map(q => (
                    <div key={q.id}>
                      <dt>{q.text}</dt>
                      <dd>{answerText(q, r.answers[q.id])}</dd>
                      {q.type === "photo" && Array.isArray(r.answers[q.id]) && (
                        <div className={s.photos}>
                          {(r.answers[q.id] as string[]).map(p => photos[p] && <img key={p} src={photos[p]} alt="領養人家中的活動空間" />)}
                        </div>
                      )}
                    </div>
                  ))}
                </dl>
                <div className={f.field}>
                  <label className={f.label} htmlFor={`st-${r.id}`}>標記</label>
                  <select id={`st-${r.id}`} value={r.status} onChange={e => setStatus(r, e.target.value as ResponseStatus)}>
                    {(["submitted", "contact", "follow_up", "declined"] as const).map(k => <option key={k} value={k}>{RESPONSE_STATUS[k]}</option>)}
                  </select>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
