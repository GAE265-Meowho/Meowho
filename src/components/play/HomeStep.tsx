"use client";
// 虛擬飼養 DEMO（#237）：在家的時光。每個節點結束後回到房間，7 個動作（逗貓、摸貓、餵貓、換水、鏟屎、剪指甲、刷牙）想做幾次都可以，也可以跳過。
// 不做房間物品互動：貓在背景，動作都是按鈕加小遊戲。規則與數值在 lib/play/care.ts。
import CatButton from "@/components/ui/CatButton";
import { CARE_ACTS, type CareAct } from "@/lib/play/care";
import { CareIcon } from "./CareIcon";
import { NEEDS } from "@/lib/play/needs";
import type { PlayState } from "@/lib/play/flow";
import s from "./play.module.css";

/** 動作改成畫面上方的一排圖示（CareBar）；這裡只剩右下角的「結束今天，繼續故事」 */
export function HomeStep({ onFinish }: { onFinish: () => void }) {
  return <div className={s.homeFinish}><CatButton onClick={onFinish}>結束今天，繼續故事</CatButton></div>;
}

/** 在家的時光：上方一排圖示，還沒做的是白底不透明，做過的半透明（還是可以再做） */
export function CareBar({ state, canPlay, onAct, onRestock }: { state: PlayState; canPlay: boolean; onAct: (act: CareAct) => void; onRestock?: () => void }) {
  return (
    <div className={s.careBar} role="group" aria-label="在家的時光">
      {NEEDS.filter(n => canPlay || n.act !== "play").map(n => {
        const done = state.homeDone.includes(n.act);
        const label = CARE_ACTS.find(a => a.act === n.act)?.label ?? n.label;
        return <button key={n.act} type="button" className={s.careIcon} data-done={done ? "true" : undefined} aria-label={`${label}${done ? "（已做，可再做）" : ""}`} title={label} onClick={() => onAct(n.act)}><CareIcon id={n.act} /></button>;
      })}
      {onRestock && <button type="button" className={s.careIcon} aria-label="補貨" title="補貨" onClick={onRestock}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 4h2l2.4 11h10.2L20 7H6.2" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></svg>
      </button>}
    </div>
  );
}
