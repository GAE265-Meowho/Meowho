"use client";
// 虛擬飼養 DEMO（#237）：在家的時光。每個節點結束後回到房間，6 個動作（逗貓、餵貓、換水、鏟屎、剪指甲、刷牙）想做幾次都可以，也可以跳過。
// 不做房間物品互動：貓在背景，動作都是按鈕加小遊戲。規則與數值在 lib/play/care.ts。
import CatButton from "@/components/ui/CatButton";
import { CARE_ACTS, type CareAct } from "@/lib/play/care";
import type { PlayState } from "@/lib/play/flow";
import s from "./play.module.css";

export function HomeStep({ state, onAct, onFinish }: { state: PlayState; onAct: (act: CareAct) => void; onFinish: () => void }) {
  const round = state.life.care.rounds + 1;
  return (
    <section className={s.card} aria-labelledby="home-time">
      <span className={s.kicker}>在家的時光・第 {round} 輪</span>
      <h2 id="home-time">回到家了</h2>
      <p className={s.lead}>每個動作想做幾次都可以，不想做也可以跳過。</p>
      <div className={s.options}>
        {CARE_ACTS.map(({ act, label }) => {
          const done = state.homeDone.includes(act);
          return <button key={act} type="button" className={s.option} onClick={() => onAct(act)}>{label}{done ? "（已做，可再做）" : ""}</button>;
        })}
      </div>
      <div className={s.actions}><CatButton onClick={onFinish}>結束，繼續故事</CatButton></div>
    </section>
  );
}
