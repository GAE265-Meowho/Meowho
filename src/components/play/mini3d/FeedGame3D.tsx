"use client";
// 虛擬飼養第 1 份：3D 餵貓（第一視角）。三種飼料：乾飼料袋（按住倒顆粒）、主食罐（濕食）、湯罐（液體），罐頭各一罐。
// 彈窗只負責把飼料放進碗；按「放好了」結束，關掉後貓才走到碗邊（PlayGame）。規則在 lib/play/mini3d/feed-rules.ts，
// 回傳 { added, over, wet, soup, spill }，careGood("feed") 看 added ≥ 15、沒過量、沒灑太多。
import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import { addCan, CAN_LANDS, CAN_SECONDS, canFrame, feedAmount, feedHint, feedResult, newFeed, pourDry, type FeedCan } from "@/lib/play/mini3d/feed-rules";
import { FeedScene, type FeedFrame } from "./FeedScene";
import styles from "./mini3d.module.css";

/** 一開始右手拿著飼料袋進來要幾秒；按住後袋子多久傾斜到底 */
const INTRO_SECONDS = 0.9, TILT_SECONDS = 0.25;
const CAN_NAME: Record<FeedCan, string> = { wet: "主食罐", soup: "湯罐" };

export function FeedGame3D({ portion, onDone }: { portion: number; onDone: (r: unknown) => void }) {
  const time = useRef(0), feed = useRef(newFeed()), holding = useRef(false), tilt = useRef(0);
  const can = useRef<{ kind: FeedCan; k: number } | null>(null);
  // 畫面上的字：碗裡多少、正在倒嗎、正在開哪一罐、哪幾罐用過了、可以開始了嗎
  const [ui, setUi] = useState({ amount: 0, pouring: false, opening: null as FeedCan | null, wet: false, soup: false, ready: false, hint: "" });

  function drive(dt: number): FeedFrame {
    time.current += dt;
    const intro = Math.min(1, time.current / INTRO_SECONDS), ready = intro >= 1;
    let frame: Omit<FeedFrame, "dry" | "wet" | "soup">;
    if (can.current) {
      const c = can.current;
      c.k = Math.min(1, c.k + dt / CAN_SECONDS);
      if (c.k >= CAN_LANDS) feed.current = addCan(feed.current, c.kind);
      frame = { ...canFrame(c.k), bagTilt: 0, pouring: false, can: c.kind };
      if (c.k >= 1) can.current = null;
    } else {
      tilt.current = Math.min(1, Math.max(0, tilt.current + (holding.current && ready ? 1 : -1) * dt / TILT_SECONDS));
      const pouring = tilt.current > 0.6;  // 袋子傾斜過一半顆粒才掉出來
      // 音效（第 6 份）：pouring 由 false 變 true 時播 sfx_pour_kibble，變回 false 時停；開罐頭時播 sfx_open_can
      if (pouring) feed.current = pourDry(feed.current, dt);
      frame = { bagHand: intro * intro * (3 - 2 * intro), bagTilt: tilt.current, pouring, can: null, canIn: 0, tabHand: 0, lid: 0, tilt: 0, drop: 0 };
    }
    const s = feed.current;
    const next = { amount: Math.round(feedAmount(s)), pouring: frame.pouring, opening: can.current?.kind ?? null, wet: s.wet, soup: s.soup, ready, hint: feedHint(s, portion, frame.pouring) };
    setUi(v => (Object.keys(next) as (keyof typeof next)[]).every(k => v[k] === next[k]) ? v : next);
    return { ...frame, dry: s.dry, wet: s.wet, soup: s.soup };
  }
  const press = (on: boolean) => { holding.current = on && ui.ready && !can.current; };
  const open = (kind: FeedCan) => { if (!can.current && !feed.current[kind] && tilt.current === 0) { holding.current = false; can.current = { kind, k: 0 }; } };
  const busy = !ui.ready || ui.opening !== null || ui.pouring;

  return <>
    <p className={styles.hint}>
      {ui.opening ? `打開${CAN_NAME[ui.opening]}，倒進碗裡…` : `按住「倒乾飼料」，倒到建議份量（${portion}）就放開；罐頭可以各加一罐。`}
    </p>
    <div className={styles.scene}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 45, near: 0.01, far: 12 }} fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <FeedScene drive={drive} />
      </Canvas>
    </div>
    <div className={styles.meters}>
      <label>碗裡 <progress max={100} value={ui.amount} /> {ui.amount}（建議 {portion}）</label>
    </div>
    <p className={styles.status} role="status">{ui.hint}</p>
    <div className={styles.meters}>
      <button className="btn" type="button" disabled={!ui.ready || ui.opening !== null} style={{ touchAction: "none", userSelect: "none" }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); press(true); }}
        onPointerUp={() => press(false)} onPointerCancel={() => press(false)} onLostPointerCapture={() => press(false)}
        onKeyDown={e => { if (e.key === " " || e.key === "Enter") press(true); }} onKeyUp={() => press(false)} onBlur={() => press(false)}
        onContextMenu={e => e.preventDefault()}>
        {ui.pouring ? "放開停止" : "按住倒乾飼料"}
      </button>
      <button className="btn" type="button" disabled={busy || ui.wet} onClick={() => open("wet")}>{ui.wet ? "主食罐已加" : "開主食罐"}</button>
      <button className="btn" type="button" disabled={busy || ui.soup} onClick={() => open("soup")}>{ui.soup ? "湯罐已加" : "開湯罐"}</button>
      <button className="btn" type="button" disabled={busy || ui.amount === 0} onClick={() => onDone(feedResult(feed.current, portion))}>放好了</button>
    </div>
  </>;
}
