"use client";
/* eslint-disable @next/next/no-img-element */
// 問卷回答（#89）：修改頁列出這隻貓收到的問卷；領養管理的對話框上方也用 AnswerList 顯示同一份回答。
// 照片在私人 bucket，用短時效網址顯示。申請狀態改由對話判斷（#128），這裡不再提供手動標記。
import { useEffect, useState } from "react";
import type { Answers, Question } from "@/lib/adoption-form/questionnaire";
import { getBrowserSupabase } from "@/lib/supabase/client";
import f from "../onboarding/intake.module.css";
import { answerText } from "./answer-text";
import s from "./form.module.css";

export const ADOPTION_PHOTO_BUCKET = "meow-adoption-photos";

interface Row { id: string; respondent_name: string | null; submitted_at: string | null; answers: Answers; photo_paths: string[] }

/** 一份問卷的回答（含照片） */
export function AnswerList({ questions, answers, photoPaths }: { questions: Question[]; answers: Answers; photoPaths: string[] }) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const key = photoPaths.join("|");
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !key) return;
    sb.storage.from(ADOPTION_PHOTO_BUCKET).createSignedUrls(key.split("|"), 3600)
      .then(({ data }) => setPhotos(Object.fromEntries((data ?? []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))));
  }, [key]);
  return (
    <dl className={s.answers}>
      {questions.filter(q => q.type !== "note").map(q => (
        <div key={q.id}>
          <dt>{q.text}</dt>
          <dd>{answerText(q, answers[q.id])}</dd>
          {q.type === "photo" && Array.isArray(answers[q.id]) && (
            <div className={s.photos}>
              {(answers[q.id] as string[]).map(p => photos[p] && <img key={p} src={photos[p]} alt="領養人家中的活動空間" />)}
            </div>
          )}
        </div>
      ))}
    </dl>
  );
}

export function Responses({ formId, catId, questions }: { formId: string; catId: string; questions: Question[] }) {
  const sb = getBrowserSupabase();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    sb.from("meow_adoption_responses").select("id, respondent_name, submitted_at, answers, photo_paths")
      .eq("form_id", formId).neq("status", "draft").order("submitted_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, [sb, formId]);

  if (!rows) return <p className={f.lead} role="status">回覆載入中…</p>;
  return (
    <div className={s.section}>
      <h3>收到的問卷（{rows.length}）</h3>
      {rows.length === 0 && <p className={f.lead}>還沒有人填寫。</p>}
      {rows.length > 0 && <a className={s.link} href={`/me/adoptions?cat=${catId}`}>到領養管理和申請人聊聊</a>}
      <ul className={s.responses}>
        {rows.map(r => (
          <li key={r.id} className={s.response}>
            <button type="button" className={s.responseHead} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <b>{r.respondent_name || "會員"}</b>
              <span>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString("zh-TW") : ""}</span>
            </button>
            {open === r.id && (
              <div className={s.responseBody}>
                <AnswerList questions={questions} answers={r.answers} photoPaths={r.photo_paths} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
