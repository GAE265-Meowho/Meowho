"use client";
// 虛擬飼養第 1 份：3D 鏟屎（第一視角）。按住畫面拖曳貓砂鏟，把大便和結塊連砂鏟起來，左右甩掉砂子，
// 再拿到左邊的垃圾袋上方放開。動作太大鏟子上的東西會掉回去。全部清掉或按「放下鏟子」結束。
// 規則在 lib/play/mini3d/scoop-rules.ts，回傳 { bagged, total, small, sandy }：每一坨都丟進垃圾袋才算鏟好（careGood("scoop")），
// 只丟一部分＝沒鏟完，一坨都沒丟就按「放下鏟子」或關掉＝沒鏟。clumps＝今天砂盆還剩幾坨（lib/play/care-day.ts；null＝今天還沒鏟過）。
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { newScoop, SCOOP_TEXT, scoopDone, scoopResult, type LitterBoxKind, type ScoopEvent, type ScoopState } from "@/lib/play/mini3d/scoop-rules";
import { ScoopScene } from "./ScoopScene";
import styles from "./mini3d.module.css";

/** box：採買選的貓砂盆款式；dirt：砂盆髒的程度（0～100） */
export function ScoopGame3D({ box = "open", dirt = 70, clumps = null, onDone }: { box?: LitterBoxKind; dirt?: number; clumps?: number | null; onDone: (r: unknown) => void }) {
  const [start] = useState<ScoopState>(() => newScoop(box, dirt, Math.random, clumps ?? undefined));
  const state = useRef(start);
  const [ui, setUi] = useState({ bagged: 0, message: "" });
  const total = start.clumps.length, clean = ui.bagged >= total;

  // 音效（第 6 份）：鏟起（pick／pickPoop）時播 sfx_scoop_litter，甩（shake／sifted）時播 sfx_sift_litter，丟進袋子（bagged／baggedSandy）時播 sfx_bag_drop
  const onEvent = (e: Exclude<ScoopEvent, null>) => setUi({ bagged: state.current.bagged, message: scoopDone(state.current) ? (e === "baggedSandy" ? "清乾淨了！不過最後那鏟帶了很多砂。" : "清乾淨了！") : SCOOP_TEXT[e] });
  // 全部清掉後停一下再關
  useEffect(() => {
    if (!clean || total === 0) return;
    const timer = setTimeout(() => onDone(scoopResult(state.current)), 900);
    return () => clearTimeout(timer);
  }, [clean, total, onDone]);

  return <>
    <p className={styles.hint}>{total ? "按住畫面拖曳貓砂鏟，慢慢鏟起大便和結塊，左右甩一甩把砂子甩掉，再拿到左邊的垃圾袋上方放開。動作太大會掉回去。" : clumps === 0 ? "今天已經鏟乾淨了，砂盆還很乾淨。" : "砂盆很乾淨，今天還不用鏟。"}</p>
    <div className={styles.scene}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 45, near: 0.01, far: 12 }} fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <ScoopScene box={box} state={state} onEvent={onEvent} />
      </Canvas>
    </div>
    <div className={styles.meters}>
      <label>清掉 <progress max={Math.max(1, total)} value={total ? ui.bagged : 1} /> {ui.bagged}/{total}</label>
    </div>
    <p className={styles.status} role="status">{ui.message}</p>
    <button className="btn" type="button" onClick={() => onDone(scoopResult(state.current))}>{total ? "放下鏟子" : "好"}</button>
  </>;
}
