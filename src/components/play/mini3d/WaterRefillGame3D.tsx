"use client";
// 虛擬飼養第 1 份：3D 換水（第一視角）。前三格自動播：右手拿舊水碗到水槽、倒掉舊水、把空碗接到出水口下；
// 之後玩家按住按鈕，左手握住把手開水，放開就關。規則在 lib/play/mini3d/water-rules.ts，回傳{ fill }，careGood("water") 看 fill ≥ 70。
import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import { REFILL_INTRO_SECONDS, REFILL_STEPS, refillAt, refillHold, refillPlayFrame } from "@/lib/play/mini3d/refill-timeline";
import { pourWater, waterHint, waterResult } from "@/lib/play/mini3d/water-rules";
import { WaterRefillScene } from "./WaterRefillScene";
import styles from "./mini3d.module.css";

export function WaterRefillGame3D({ onDone }: { onDone: (r: unknown) => void }) {
  const time = useRef(0), fill = useRef(0), holding = useRef(false), hold = useRef({ leftReach: 0, open: 0 });
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);
  const [pouring, setPouring] = useState(false);
  const ready = step >= 3;  // 前三格播完，換玩家

  function drive(dt: number) {
    time.current += dt;
    if (time.current < REFILL_INTRO_SECONDS) return refillAt(time.current);
    hold.current = refillHold(hold.current, holding.current, dt);
    const on = hold.current.open > 0.5;  // 把手抬過一半才出水
    fill.current = pourWater(fill.current, dt, on);
    const n = Math.round(fill.current);
    setShown(v => (v === n ? v : n));
    // 音效（第 6 份）：on 由 false 變 true 時播 sfx_pour_water，變回 false 時停
    setPouring(v => (v === on ? v : on));
    return refillPlayFrame(hold.current, fill.current);
  }
  const press = (on: boolean) => { holding.current = on && ready; };

  return <>
    <p className={styles.hint}>{ready ? "按住「開水龍頭」接水，七分滿就放開。" : REFILL_STEPS[step].label + "…"}</p>
    <div className={styles.scene}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 45, near: 0.01, far: 12 }} fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <WaterRefillScene drive={drive} onStep={setStep} />
      </Canvas>
    </div>
    <div className={styles.meters}>
      <label>水量 <progress max={100} value={Math.min(100, shown)} /> {Math.min(100, shown)}</label>
    </div>
    <p className={styles.status} role="status">{waterHint(shown, pouring)}</p>
    <button className="btn" type="button" disabled={!ready} style={{ touchAction: "none", userSelect: "none" }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); press(true); }}
      onPointerUp={() => press(false)} onPointerCancel={() => press(false)} onLostPointerCapture={() => press(false)}
      onKeyDown={e => { if (e.key === " " || e.key === "Enter") press(true); }} onKeyUp={() => press(false)} onBlur={() => press(false)}
      onContextMenu={e => e.preventDefault()}>
      {pouring ? "放開關水" : "按住開水龍頭"}
    </button>{" "}
    <button className="btn" type="button" disabled={shown === 0 || pouring} onClick={() => onDone(waterResult(fill.current))}>倒好了</button>
  </>;
}
