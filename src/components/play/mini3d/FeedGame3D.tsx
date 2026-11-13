"use client";
// 虛擬飼養第 1 份：3D 餵貓（第一視角）。一餐只餵一種：先選乾飼料袋（按住倒顆粒）、主食罐（濕食）或湯罐（液體），再開始倒；罐頭可以連開幾罐。
// 彈窗只負責把飼料放進碗；按「放好了」結束，關掉後貓才走到碗邊（PlayGame）。規則在 lib/play/mini3d/feed-rules.ts，
// 回傳 { added, over, wet, soup, spill }，careGood("feed") 看 added ≥ 15、沒過量、沒灑太多。
import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import { addCan, CAN_LANDS, CAN_SECONDS, canFits, canFrame, feedAmount, feedHint, feedResult, newFeed, pourDry, type FeedKind } from "@/lib/play/mini3d/feed-rules";
import { FeedScene, type FeedFrame } from "./FeedScene";
import styles from "./mini3d.module.css";

/** 一開始右手拿著飼料袋進來要幾秒；按住後袋子多久傾斜到底 */
const INTRO_SECONDS = 0.9, TILT_SECONDS = 0.25;
const KIND_NAME: Record<FeedKind, string> = { dry: "乾飼料", wet: "主食罐", soup: "湯罐" };
const KINDS: FeedKind[] = ["dry", "wet", "soup"];
/** 兩隻手都不在畫面裡、什麼都沒在倒 */
const IDLE = { bagHand: 0, bagTilt: 0, pouring: false, can: null, canIn: 0, tabHand: 0, lid: 0, tilt: 0, drop: 0 } as const;

/** kinds＝家裡有的飼料種類（lib/play/restock.ts）；沒買的顯示成鎖住，onRestock 開補貨視窗。沒傳 kinds 就三種都能選 */
export function FeedGame3D({ portion, onDone, kinds = KINDS, onRestock }: { portion: number; onDone: (r: unknown) => void; kinds?: FeedKind[]; onRestock?: () => void }) {
  // 這一餐餵哪一種；還沒選就先問
  const [kind, setKind] = useState<FeedKind | null>(null);
  const time = useRef(0), feed = useRef(newFeed()), holding = useRef(false), tilt = useRef(0);
  /** 正在開的那一罐：k 是動作進度 0～1，landed 是內容倒進碗了沒（只算一次） */
  const can = useRef<{ k: number; landed: boolean } | null>(null);
  // 畫面上的字：碗裡多少、正在倒嗎、正在開罐頭嗎、還放得下一罐嗎、可以開始了嗎
  const [ui, setUi] = useState({ amount: 0, pouring: false, opening: false, fits: true, ready: false, hint: "" });

  function drive(dt: number): FeedFrame {
    const s0 = feed.current;
    if (!kind) return { ...IDLE, dry: s0.dry, wet: s0.wet > 0, soup: s0.soup > 0 };
    time.current += dt;
    // 選好之後手先伸進來：乾飼料是右手拿著飼料袋，罐頭是左手拿著罐頭
    const intro = Math.min(1, time.current / INTRO_SECONDS), reach = intro * intro * (3 - 2 * intro), ready = intro >= 1;
    let frame: Omit<FeedFrame, "dry" | "wet" | "soup">;
    if (kind === "dry") {
      tilt.current = Math.min(1, Math.max(0, tilt.current + (holding.current && ready ? 1 : -1) * dt / TILT_SECONDS));
      const pouring = tilt.current > 0.6;  // 袋子傾斜過一半顆粒才掉出來
      // 音效（第 6 份）：pouring 由 false 變 true 時播 sfx_pour_kibble，變回 false 時停；開罐頭時播 sfx_open_can
      if (pouring) feed.current = pourDry(feed.current, dt);
      frame = { ...IDLE, bagHand: reach, bagTilt: tilt.current, pouring };
    } else if (can.current) {
      const c = can.current;
      c.k = Math.min(1, c.k + dt / CAN_SECONDS);
      if (c.k >= CAN_LANDS && !c.landed) { c.landed = true; feed.current = addCan(feed.current, kind); }
      // 只餵罐頭時右手沒有飼料袋：bagHand 固定 0，右手只在拉拉環時進來
      frame = { ...canFrame(c.k), bagHand: 0, bagTilt: 0, pouring: false, can: kind };
      if (c.k >= 1) can.current = null;
    } else frame = { ...IDLE, can: kind, canIn: reach };
    const s = feed.current;
    const next = { amount: Math.round(feedAmount(s)), pouring: frame.pouring, opening: can.current !== null, fits: kind === "dry" || canFits(s, kind), ready, hint: feedHint(s, portion, frame.pouring) };
    setUi(v => (Object.keys(next) as (keyof typeof next)[]).every(k => v[k] === next[k]) ? v : next);
    return { ...frame, dry: s.dry, wet: s.wet > 0, soup: s.soup > 0 };
  }
  const press = (on: boolean) => { holding.current = on && ui.ready; };
  const open = () => { if (kind && kind !== "dry" && ui.ready && !can.current && canFits(feed.current, kind)) can.current = { k: 0, landed: false }; };

  return <>
    <p className={styles.hint}>
      {!kind ? (kinds.length === 0 ? "家裡沒有飼料了，先去補貨。" : "這一餐要餵哪一種？一次只餵一種。")
        : kind === "dry" ? `按住「倒乾飼料」，倒到建議份量（${portion}）就放開。`
        : ui.opening ? `打開${KIND_NAME[kind]}，倒進碗裡…` : `按「開一罐${KIND_NAME[kind]}」倒進碗裡，不夠可以再開一罐（建議份量 ${portion}）。`}
    </p>
    <div className={styles.scene}>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 45, near: 0.01, far: 12 }} fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <FeedScene drive={drive} />
      </Canvas>
    </div>
    {!kind
      ? <div className={styles.meters} role="group" aria-label="選飼料">
        {KINDS.map(k => kinds.includes(k)
          ? <button key={k} className="btn" type="button" onClick={() => setKind(k)}>{KIND_NAME[k]}</button>
          : <button key={k} className="btn" type="button" aria-disabled="true" style={{ opacity: 0.55, cursor: "not-allowed" }}>{KIND_NAME[k]}（{k === "dry" ? "家裡沒有乾糧" : "家裡沒有罐頭"}）</button>)}
        {kinds.length < KINDS.length && onRestock && <button className="btn" type="button" style={{ minHeight: 44 }} onClick={onRestock}>去補貨</button>}
      </div>
      : <>
        <div className={styles.meters}>
          <label>碗裡（{KIND_NAME[kind]}）<progress max={100} value={ui.amount} /> {ui.amount}（建議 {portion}）</label>
        </div>
        <p className={styles.status} role="status">{ui.hint}</p>
        <div className={styles.meters}>
          {kind === "dry"
            ? <button className="btn" type="button" disabled={!ui.ready} style={{ touchAction: "none", userSelect: "none" }}
              onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); press(true); }}
              onPointerUp={() => press(false)} onPointerCancel={() => press(false)} onLostPointerCapture={() => press(false)}
              onKeyDown={e => { if (e.key === " " || e.key === "Enter") press(true); }} onKeyUp={() => press(false)} onBlur={() => press(false)}
              onContextMenu={e => e.preventDefault()}>
              {ui.pouring ? "放開停止" : "按住倒乾飼料"}
            </button>
            : <button className="btn" type="button" disabled={!ui.ready || ui.opening || !ui.fits} onClick={open}>{ui.fits ? `開一罐${KIND_NAME[kind]}` : "碗放不下了"}</button>}
          <button className="btn" type="button" disabled={ui.opening || ui.pouring || ui.amount === 0} onClick={() => onDone(feedResult(feed.current, portion))}>放好了</button>
        </div>
      </>}
  </>;
}
