"use client";
// 說說牠之後的口說補充（#478）：還沒填的欄位彙整在一起，列出要講哪些、每項怎麼說，中途按住麥克風一次講一段。
// 題目與解析在 lib/onboarding/new-cat-guide.ts；送出、改用點的按鈕在 NewCatFlow 的底部按鈕區。
import { useRef } from "react";
import type { GuideQuestion } from "@/lib/onboarding/new-cat-guide";
import { MicIcon } from "./parts";
import { useMic } from "./PhotoTalk";
import s from "./newcat.module.css";

/** 「可以這樣說：「三公斤」，……」→「三公斤」 */
const example = (hint: string) => hint.match(/「(.+?)」/)?.[1] ?? "";

export function GuideStep({ questions, catName, answer, setAnswer, status, setStatus }: {
  questions: GuideQuestion[]; catName: string; answer: string; setAnswer: (fn: (a: string) => string) => void;
  status: string; setStatus: (m: string) => void;
}) {
  const base = useRef("");
  const mic = useMic(t => setAnswer(() => base.current + t), setStatus);
  const n = catName.trim() || "牠";
  return (
    <>
      <h2 className={s.h1}>再說說{n}的這些事</h2>
      <p className={s.lead}>還差下面 {questions.length} 件事。一次講完就好，不知道的說「不知道」。</p>
      <section className={`${s.card} ${s.stack}`} aria-label="還要講的事" style={{ gap: 10 }}>
        <ol className={s.guideList}>
          {questions.map(q => (
            <li key={q.id}><b>{q.ask}</b><span>{q.hint}</span></li>
          ))}
        </ol>
      </section>
      <div className={s.gap} />
      <section className={`${s.card} ${s.stack} ${s.center}`} aria-label="用說的回答" style={{ gap: 12 }}>
        <button type="button" className={`${s.mic} ${mic.on ? s.on : ""}`} aria-label="按住說話"
          onPointerDown={e => { e.preventDefault(); base.current = answer ? answer.replace(/\s*$/, "") + (/[。，！？]$/.test(answer.trim()) ? "" : "，") : ""; mic.start(); }}
          onPointerUp={mic.stop} onPointerLeave={mic.stop} onPointerCancel={mic.stop}><MicIcon /></button>
        <b>{mic.on ? "放開就停止" : "按住一次說完"}</b>
        <div className={s.field} style={{ alignSelf: "stretch", textAlign: "left" }}>
          <label className={s.label} htmlFor="guide-answer">聽到的內容，有錯可以直接改</label>
          <textarea id="guide-answer" className={s.story} style={{ minHeight: 140 }} maxLength={1000} value={answer}
            placeholder={`例如：${questions.map(q => example(q.hint)).filter(Boolean).join("，")}`}
            onChange={e => { const v = e.target.value; setAnswer(() => v); }} />
        </div>
        <p className={s.status} role="status">{status}</p>
      </section>
    </>
  );
}
