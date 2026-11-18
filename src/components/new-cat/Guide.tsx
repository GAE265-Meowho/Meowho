"use client";
// 說說牠之後的口說追問（#478）：一次一題，按住麥克風回答；題目與解析在 lib/onboarding/new-cat-guide.ts。
// 送出、跳過、改用點的按鈕在 NewCatFlow 的底部按鈕區。
import { useRef } from "react";
import type { GuideQuestion } from "@/lib/onboarding/new-cat-guide";
import { MicIcon } from "./parts";
import { useMic } from "./PhotoTalk";
import s from "./newcat.module.css";

export function GuideStep({ q, index, total, answer, setAnswer, status, setStatus }: {
  q: GuideQuestion; index: number; total: number; answer: string; setAnswer: (fn: (a: string) => string) => void;
  status: string; setStatus: (m: string) => void;
}) {
  const base = useRef("");
  const mic = useMic(t => setAnswer(() => base.current + t), setStatus);
  return (
    <>
      <div className={s.rowBetween} style={{ marginBottom: 8 }}>
        <span className={s.kicker}>再問幾件事｜第 {index + 1} 題，共 {total} 題</span>
      </div>
      <h2 className={s.h1}>{q.ask}</h2>
      <p className={s.lead}>{q.hint}</p>
      <section className={`${s.card} ${s.stack} ${s.center}`} aria-label="用說的回答" style={{ gap: 12 }}>
        <button type="button" className={`${s.mic} ${mic.on ? s.on : ""}`} aria-label="按住說話"
          onPointerDown={e => { e.preventDefault(); base.current = answer ? answer.replace(/\s*$/, "") + (/[。，！？]$/.test(answer.trim()) ? "" : "，") : ""; mic.start(); }}
          onPointerUp={mic.stop} onPointerLeave={mic.stop} onPointerCancel={mic.stop}><MicIcon /></button>
        <b>{mic.on ? "放開就停止" : "按住回答"}</b>
        <div className={s.field} style={{ alignSelf: "stretch", textAlign: "left" }}>
          <label className={s.label} htmlFor="guide-answer">聽到的內容，有錯可以直接改</label>
          <textarea id="guide-answer" className={s.story} style={{ minHeight: 90 }} maxLength={500} value={answer}
            onChange={e => { const v = e.target.value; setAnswer(() => v); }} />
        </div>
        <p className={s.status} role="status">{status}</p>
      </section>
    </>
  );
}
