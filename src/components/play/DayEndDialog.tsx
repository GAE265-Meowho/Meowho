"use client";
// 每天結束的儀式（#354）：一個節點結束、進下一個節點前，中途跳出來說今天是第幾天與接下來的任務，按「開始」才進下一天。
// 用原生 <dialog> showModal：背景不能點、焦點留在視窗裡；Esc 不關（一定要按「開始」），關掉後焦點回到原本的元素。文字在 lib/play/day-end.ts。
import { useEffect, useRef } from "react";
import CatButton from "@/components/ui/CatButton";
import type { DayEnd } from "@/lib/play/day-end";
import { SPEAKER_NAMES } from "@/lib/play/story";
import { SpeakerAvatar } from "./SpeakerAvatar";
import d from "./dayend.module.css";

export function DayEndDialog({ day, onStart }: { day: DayEnd; onStart: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const start = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const back = document.activeElement as HTMLElement | null;
    if (!el.open) el.showModal();
    start.current?.querySelector("button")?.focus();
    return () => { if (el.open) el.close(); back?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className={d.dialog} aria-labelledby="dayend-title" aria-describedby="dayend-lines" onCancel={e => e.preventDefault()}>
      <p className={d.today} id="dayend-title">{day.title}</p>
      <div className={d.say}>
        <p className={d.who}><SpeakerAvatar id="clerk" size={48} /><span className={d.name}>{SPEAKER_NAMES.clerk}</span></p>
        <div id="dayend-lines" className={d.lines}>
          {day.lines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </div>
      <div className={d.foot} ref={start}>
        <span className={d.next}>下一站：{day.next}</span>
        <CatButton onClick={onStart}>開始</CatButton>
      </div>
    </dialog>
  );
}
