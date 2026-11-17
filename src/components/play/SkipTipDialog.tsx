"use client";
// 跳過任務的提示（#456）：按「結束今天」時，還有沒做的照顧動作，先跳這個小卡說長期不做可能引發什麼問題，再繼續。
// 文字在 lib/play/skip-tips.ts（規則模板，附獸醫聲明）。最多三項，不用捲動。樣式沿用每天結束的小卡（dayend.module.css）。
import { useEffect, useRef } from "react";
import CatButton from "@/components/ui/CatButton";
import { VET_NOTICE, type SkipTips } from "@/lib/play/skip-tips";
import d from "./dayend.module.css";

export function SkipTipDialog({ tips, onContinue }: { tips: SkipTips; onContinue: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const back = document.activeElement as HTMLElement | null;
    if (!el.open) el.showModal();
    foot.current?.querySelector("button")?.focus();
    return () => { if (el.open) el.close(); back?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className={d.dialog} aria-labelledby="skiptip-title" aria-describedby="skiptip-lines" onCancel={e => e.preventDefault()}>
      <p className={d.today} id="skiptip-title">今天還有沒做的事</p>
      <div id="skiptip-lines" className={d.lines}>
        {tips.items.map(t => <p key={t.act}><strong>{t.label}：</strong>{t.tip}</p>)}
        {tips.more > 0 && <p>另外還有 {tips.more} 項也沒做。</p>}
      </div>
      <div className={d.foot} ref={foot}>
        <span className={d.next}>{VET_NOTICE}</span>
        <CatButton onClick={onContinue}>知道了</CatButton>
      </div>
    </dialog>
  );
}
