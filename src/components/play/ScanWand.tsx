"use client";
// 虛擬飼養 DEMO（#237）：3D 掃描房間裡的逗貓。玩具在 3D 房間（RoomViewer 的 wand）；這裡只放抓到幾次、開心度和結束按鈕。
// 沒有時間限制，按「先到這裡」就把結果（catchResult）交給劇情，格式和原本 2D 逗貓一樣。
import { useRef } from "react";
import CatButton from "@/components/ui/CatButton";
import { catchResult, funFromCatches } from "@/lib/play/scene-cat";
import s from "./play.module.css";

export function ScanWand({ catName, catches, onDone }: { catName: string; catches: number; onDone: (r: ReturnType<typeof catchResult>) => void }) {
  const latest = useRef(catches);
  latest.current = catches;
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(catchResult(latest.current)); } };
  const fun = funFromCatches(catches);
  return (
    <section className={s.card} aria-label="逗貓">
      <h2>逗{catName}</h2>
      <p className={s.lead}>在上面的房間裡移動滑鼠（手機用手指滑），讓玩具在地板上跑，也可以跑到床上，{catName}會衝過去追，真的碰到才算抓到。玩夠了再按「先到這裡」。</p>
      <div className={s.meter} role="progressbar" aria-label="開心度" aria-valuenow={fun} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${fun}%` }} /></div>
      <p className={s.lead}>抓到 {catches} 次</p>
      <div className={s.actions}><CatButton onClick={finish}>先到這裡</CatButton></div>
    </section>
  );
}
