"use client";
// 虛擬飼養第 1 份：3D 換水（第一視角）。自動播：右手拿舊水碗到水槽、倒掉舊水；
// 玩家：左手拿菜瓜布在碗裡搓（畫圈、來回都算）洗碗 → 碗移到出水口下 → 按住開水沖掉泡泡 → 倒掉沖碗的水 → 按住開水接新水。
// 規則在 lib/play/mini3d/water-rules.ts（水量）、wash-rules.ts（洗碗、沖碗），回傳 { fill, washed }，careGood("water") 只看 fill ≥ 70。
import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import { REFILL_STEPS, refillAt, refillHold, refillPlayFrame, type RefillFrame } from "@/lib/play/mini3d/refill-timeline";
import { pourWater, waterHint, waterResult } from "@/lib/play/mini3d/water-rules";
import { DUMP_SECONDS, dumpFrame, newScrub, rinseStep, scrubClean, scrubStep } from "@/lib/play/mini3d/wash-rules";
import { WaterRefillScene } from "./WaterRefillScene";
import styles from "./mini3d.module.css";

type Phase = "intro" | "wash" | "toTap" | "rinse" | "dump" | "fill";
/** 自動播的前兩格（拿碗、倒舊水）共幾秒；拿菜瓜布的手伸進來、碗移到出水口下各幾秒 */
const INTRO_SECONDS = REFILL_STEPS[0].seconds + REFILL_STEPS[1].seconds, REACH_SECONDS = 0.6, TO_TAP_SECONDS = 1;
const HINT: Record<Exclude<Phase, "fill">, string> = {
  intro: "倒掉舊水…",
  wash: "按住碗裡拖曳，用菜瓜布畫圈或來回把水垢搓掉。",
  toTap: "把碗拿到水龍頭下…",
  rinse: "按住「開水龍頭」，把泡泡沖乾淨。",
  dump: "倒掉沖碗的水…",
};
const smooth = (k: number) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

export function WaterRefillGame3D({ onDone }: { onDone: (r: unknown) => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const at = useRef({ phase: "intro" as Phase, t: 0 });
  const scrub = useRef({ x: 0, z: 0, down: false }), scrubbed = useRef(newScrub());
  const rinse = useRef({ foam: 0, water: 0 });
  const fill = useRef(0), holding = useRef(false), hold = useRef({ leftReach: 0, open: 0 });
  const [ui, setUi] = useState({ clean: 0, foam: 0, fill: 0, pouring: false });

  const go = (p: Phase) => { at.current = { phase: p, t: 0 }; holding.current = false; setPhase(p); };

  function drive(dt: number): RefillFrame {
    const s = at.current;
    s.t += dt;
    const clean = scrubClean(scrubbed.current);
    const front = { step: 2, near: 1, under: 0, tilt: 0, water: 0, dirty: false, pouring: false, rightPose: "cradle" as const, leftReach: 0, open: 0 };
    const washed = (sponge: number, foam: number) => ({ sponge, x: scrub.current.x, z: scrub.current.z, dirt: 1 - clean, foam });
    let f: RefillFrame;
    switch (s.phase) {
      case "intro":
        if (s.t >= INTRO_SECONDS) go("wash");
        f = { ...refillAt(Math.min(s.t, INTRO_SECONDS - 0.001)), wash: { sponge: 0, x: 0, z: 0, dirt: 1, foam: 0 } };
        break;
      case "wash": {
        const reach = smooth(s.t / REACH_SECONDS);
        if (reach >= 1) scrubbed.current = scrubStep(scrubbed.current, scrub.current.x, scrub.current.z, scrub.current.down);
        // 搓到乾淨就自動往下
        if (scrubClean(scrubbed.current) >= 1) go("toTap");
        f = { ...front, wash: washed(reach, clean) };
        break;
      }
      case "toTap":
        if (s.t >= TO_TAP_SECONDS) { rinse.current = { foam: clean, water: 0 }; go("rinse"); }
        f = { ...front, step: 3, under: smooth(s.t / TO_TAP_SECONDS), wash: washed(1 - smooth(s.t / (TO_TAP_SECONDS / 2)), clean) };
        break;
      case "rinse":
        hold.current = refillHold(hold.current, holding.current, dt);
        rinse.current = rinseStep(rinse.current, hold.current.open, dt);
        // 泡泡沖光、水關好、左手離開把手，就倒掉沖碗的水
        if (rinse.current.foam <= 0 && hold.current.open === 0 && hold.current.leftReach === 0) go("dump");
        f = { ...refillPlayFrame(hold.current, rinse.current.water * 100), wash: washed(0, rinse.current.foam) };
        break;
      case "dump": {
        const d = dumpFrame(s.t / DUMP_SECONDS);
        if (s.t >= DUMP_SECONDS) go("fill");
        f = { ...refillPlayFrame(hold.current, 0), tilt: d.tilt, water: rinse.current.water * d.water, pouring: d.pouring, rightPose: "rim", wash: washed(0, 0) };
        break;
      }
      case "fill": {
        hold.current = refillHold(hold.current, holding.current, dt);
        fill.current = pourWater(fill.current, dt, hold.current.open > 0.5);  // 把手抬過一半才出水
        f = { ...refillPlayFrame(hold.current, fill.current), wash: washed(0, 0) };
        break;
      }
    }
    // 音效（第 6 份）：開水（open 過一半）時播 sfx_pour_water，關掉時停；搓碗（scrub.down 且在動）時播 sfx_scrub
    const next = { clean: Math.round(clean * 100), foam: Math.round(rinse.current.foam * 100), fill: Math.round(fill.current), pouring: hold.current.open > 0.5 };
    setUi(v => (Object.keys(next) as (keyof typeof next)[]).every(k => v[k] === next[k]) ? v : next);
    return f;
  }
  const press = (on: boolean) => { holding.current = on && (at.current.phase === "rinse" || at.current.phase === "fill"); };
  const finish = () => onDone({ ...waterResult(fill.current), washed: scrubClean(scrubbed.current) >= 1 });

  return <>
    <p className={styles.hint}>{phase === "fill" ? "按住「開水龍頭」接新水，七分滿就放開。" : HINT[phase]}</p>
    <div className={styles.scene}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 45, near: 0.01, far: 12 }} fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <WaterRefillScene drive={drive} scrub={scrub} />
      </Canvas>
    </div>
    <div className={styles.meters}>
      {phase === "fill"
        ? <label>水量 <progress max={100} value={Math.min(100, ui.fill)} /> {Math.min(100, ui.fill)}</label>
        : phase === "rinse" || phase === "dump"
          ? <label>泡泡 <progress max={100} value={ui.foam} /> {ui.foam}</label>
          : <label>乾淨 <progress max={100} value={ui.clean} /> {ui.clean}</label>}
    </div>
    <p className={styles.status} role="status">{phase === "fill" ? waterHint(ui.fill, ui.pouring) : phase === "rinse" && ui.pouring ? "嘩啦啦……" : ""}</p>
    {phase === "wash" && <button className="btn" type="button" onClick={() => go("toTap")}>洗好了</button>}
    {(phase === "rinse" || phase === "fill") && <button className="btn" type="button" style={{ touchAction: "none", userSelect: "none" }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); press(true); }}
      onPointerUp={() => press(false)} onPointerCancel={() => press(false)} onLostPointerCapture={() => press(false)}
      onKeyDown={e => { if (e.key === " " || e.key === "Enter") press(true); }} onKeyUp={() => press(false)} onBlur={() => press(false)}
      onContextMenu={e => e.preventDefault()}>
      {ui.pouring ? "放開關水" : "按住開水龍頭"}
    </button>}{" "}
    {phase === "fill" && <button className="btn" type="button" disabled={ui.fill === 0 || ui.pouring} onClick={finish}>倒好了</button>}
  </>;
}
