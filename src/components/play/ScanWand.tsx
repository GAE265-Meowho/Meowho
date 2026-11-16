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
  // 渝茜 2026-11-16：文字框太大，至少縮小一半讓房間畫面大一點 → 改成一條：短說明、開心度、抓到幾次、按鈕排一列（完整玩法在示範裡）
  return (
    <section className={`${s.card} ${s.wandBar}`} aria-label="逗貓">
      <p className={s.wandTip}><b>逗{catName}</b>　移動滑鼠（手機用手指滑）帶玩具跑，碰到才算抓到</p>
      <div className={s.wandRow}>
        <div className={s.meter} role="progressbar" aria-label="開心度" aria-valuenow={fun} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${fun}%` }} /></div>
        <span className={s.wandCount}>抓到 {catches} 次</span>
        <CatButton size="sm" onClick={finish}>先到這裡</CatButton>
      </div>
    </section>
  );
}
