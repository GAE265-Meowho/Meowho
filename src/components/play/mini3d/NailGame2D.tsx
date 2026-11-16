"use client";
// 虛擬飼養第 2 份：剪指甲 2D 特寫（程式 ID：小遊戲 nail、道具 nail_paw、nail_clipper）。
// 底圖是真實感的小貓腳掌照片（AI 合成），指甲、血、指甲刀是疊在照片上的 SVG；對位座標在 lib/play/mini3d/nail-paw.ts。
// 雙手操作：一根手指按住肉球（指甲才伸出來），另一根手指拖指甲刀，放開就剪。
// 電腦：點一下肉球固定（再點一下放開）或按住空白鍵，移動滑鼠對準後按一下。
// 規則在 lib/play/mini3d/nail-rules.ts，回傳 { score, bleed, bitten, ran }。
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { playSfx } from "@/lib/play/audio-player";
import { aimAt, CLAW_LEN as LEN, PAW_PHOTO, PAW_TOES } from "@/lib/play/mini3d/nail-paw";
import { NAIL_COUNT, NAIL_QUICK, NAIL_TEXT, nailClip, nailCutCount, nailPress, nailRelease, nailResult, nailStop, nailTick, newNail, type NailEvent, type NailState } from "@/lib/play/mini3d/nail-rules";
import type { MiniCtx } from "../catgame/minis";
import styles from "./mini3d.module.css";
import art from "./nail.module.css";

/** 手指會擋住指甲，觸控時刀口放在手指的左邊（指甲刀從右邊伸過來，不擋住指甲） */
const TOUCH_OFFSET = { x: -48, y: -10 };

/** 一根指甲：畫在自己的座標裡（根部在原點、尖端朝上），再依腳趾方向轉過去。根部用漸層淡出，看起來像從毛裡伸出來 */
function ClawShape({ i, state }: { i: number; state: NailState }) {
  const c = state.claws[i];
  if (!c.cut && state.held !== i) return null;
  const t = PAW_TOES[i], left = c.depth === null ? LEN : LEN * (1 - c.depth);
  const quick = Math.min(left, LEN * (1 - NAIL_QUICK));
  /** 指甲越往尖端越細：剪斷處的半寬 */
  const half = 9 - 6.5 * (left / LEN);
  return <g transform={`translate(${t.base.x},${t.base.y}) rotate(${t.angle})`}>
    <g mask="url(#nail-root)">
      <path className={art.claw} d={c.cut
        ? `M-9,6 L${-half},${-left} L${half},${-left} L9,6 Z`
        : `M-9,6 Q-9,${-LEN * 0.55} 2,${-LEN} Q8,${-LEN * 0.45} 9,6 Z`} />
      <path className={art.quick} d={`M-5,6 L-2.2,${-quick} Q0,${-quick - 3} 2.2,${-quick} L5,6 Z`} />
      <path className={art.shine} d={`M-3.5,0 L-2.5,${-left + 4}`} />
    </g>
    {c.cut === "bleed" && <>
      <circle className={art.blood} cx="0" cy={-left} r="6" />
      <circle className={art.drip} cx="0" cy={-left + 6} r="3.5" />
    </>}
  </g>;
}

export function NailGame2D({ ctx, onDone }: { ctx: MiniCtx; onDone: (r: unknown) => void }) {
  const cat = ctx.cat;
  const [start] = useState<NailState>(newNail);
  const game = useRef(start);
  const [view, setView] = useState(start);
  const [message, setMessage] = useState("");
  const [clipper, setClipper] = useState({ x: 262, y: 44 });
  const [hissing, setHissing] = useState(false);
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);
  const svg = useRef<SVGSVGElement>(null);
  /** 哪一根手指在按腳趾、哪一根在拿指甲刀；滑鼠點肉球是固定住（locked），不用一直按著 */
  const hands = useRef<{ hold: number | null; clip: number | null; locked: boolean }>({ hold: null, clip: null, locked: false });

  const apply = useCallback((out: { state: NailState; event: NailEvent }) => {
    if (out.state === game.current && !out.event) return;
    game.current = out.state;
    setView(out.state);
    const e = out.event;
    if (!e) return;
    setMessage(NAIL_TEXT[e]);
    if (e === "tip" || e === "good" || e === "bleed") playSfx("sfx_clip");
    if (e === "bleed") { playSfx("sfx_scream"); setTimeout(() => playSfx("sfx_hiss"), 450); setHissing(true); setTimeout(() => setHissing(false), 2200); }
    if (e === "pull") hands.current = { ...hands.current, hold: null, locked: false };
    if (e === "bitten" || e === "ran") { playSfx("sfx_hiss"); playSfx("sfx_fail"); }
    if (e === "done") playSfx("sfx_done");
  }, []);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      apply(nailTick(game.current, dt, cat));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [apply, cat]);

  // 結束後停一下再關，讓玩家看到最後的結果
  const ended = view.end;
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => onDone(nailResult(game.current)), ended === "stop" ? 0 : 1100);
    return () => clearTimeout(timer);
  }, [ended, onDone]);

  // 電腦：按住空白鍵＝按住下一根還沒剪的腳趾
  useEffect(() => {
    const next = () => game.current.claws.findIndex(c => !c.cut);
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (!e.repeat && next() >= 0) apply(nailPress(game.current, next()));
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !hands.current.locked) apply({ state: nailRelease(game.current), event: null });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [apply]);

  const point = (e: ReactPointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const off = e.pointerType === "mouse" ? { x: 0, y: 0 } : TOUCH_OFFSET;
    return { x: p.x + off.x, y: p.y + off.y };
  };
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const h = hands.current, mouse = e.pointerType === "mouse";
    const toeAttr = (e.target as Element).getAttribute?.("data-toe");
    // 已經有一根手指按著腳趾時，第二根手指一律是指甲刀（就算碰到別的肉球）
    if (toeAttr !== null && toeAttr !== undefined && (mouse || h.hold === null)) {
      const toe = Number(toeAttr);
      if (mouse && h.locked && game.current.held === toe) { hands.current = { ...h, locked: false }; apply({ state: nailRelease(game.current), event: null }); return; }
      const out = nailPress(game.current, toe);
      if (out.state.held === toe) hands.current = { ...h, hold: mouse ? null : e.pointerId, locked: mouse };
      apply(out);
    } else {
      hands.current = { ...h, clip: e.pointerId };
      setClipper(point(e));
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerId === hands.current.clip || (e.pointerType === "mouse" && hands.current.hold === null)) setClipper(point(e));
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const h = hands.current;
    if (e.pointerId === h.hold) {
      hands.current = { ...h, hold: null };
      apply({ state: nailRelease(game.current), event: null });
    } else if (e.pointerId === h.clip) {
      hands.current = { ...h, clip: null };
      const p = point(e), aim = aimAt(p.x, p.y);
      setClipper(p);
      // 剪下去會放開那一根；手指還按著的話要重按（規則：剪完指甲縮回）
      apply(nailClip(game.current, aim.toe, aim.depth, cat));
      if (game.current.held === null) hands.current = { ...hands.current, hold: null, locked: false };
    }
  };

  const cutCount = nailCutCount(view);
  const pawClass = [art.paw, view.pulledFor > 0 || view.end === "ran" ? art.pawPulled : view.resist > 45 ? art.pawTense : ""].join(" ");
  const aim = aimAt(clipper.x, clipper.y);

  return <>
    <p className={styles.hint}>{touch
      ? "一根手指按住肉球，指甲才會伸出來；另一根手指把指甲刀拖到白色尖端，放開就剪。粉紅色是血線，剪到會流血。"
      : "點一下肉球固定（或按住空白鍵），指甲才會伸出來；滑鼠移到白色尖端按一下就剪。粉紅色是血線，剪到會流血。"}</p>
    <svg ref={svg} className={art.arena} viewBox={`0 0 ${PAW_PHOTO.size} ${PAW_PHOTO.size}`} role="img" aria-label="小貓腳掌特寫（AI 合成影像）"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()}>
      <defs>
        <linearGradient id="nail-fade" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(0,-6) scale(1,14)">
          <stop offset="0" stopColor="white" /><stop offset="1" stopColor="black" />
        </linearGradient>
        <mask id="nail-root" maskUnits="userSpaceOnUse" x="-12" y={-LEN - 6} width="24" height={LEN + 16}>
          <rect x="-12" y={-LEN - 6} width="24" height={LEN} fill="white" />
          <rect x="-12" y="-6" width="24" height="14" fill="url(#nail-fade)" />
        </mask>
      </defs>
      <g className={pawClass}>
        <image href={PAW_PHOTO.src} width={PAW_PHOTO.size} height={PAW_PHOTO.size} preserveAspectRatio="xMidYMid slice" />
        {PAW_TOES.map((_, i) => <ClawShape key={i} i={i} state={view} />)}
        {PAW_TOES.map((t, i) => <ellipse key={i} data-toe={i} cx={t.pad.x} cy={t.pad.y} rx="25" ry="30" transform={`rotate(${t.angle} ${t.pad.x} ${t.pad.y})`}
          className={[art.toe, view.held === i ? art.toeHeld : "", view.claws[i].cut ? art.toeDone : ""].join(" ")} />)}
      </g>
      {hissing && <rect className={art.flash} width={PAW_PHOTO.size} height={PAW_PHOTO.size} />}
      <g className={art.clipperGroup} transform={`translate(${clipper.x.toFixed(1)},${clipper.y.toFixed(1)})`}>
        {aim.toe !== null && view.held === aim.toe && <path className={art.aim} d="M-22,0 H22" />}
        <path className={art.clipper} d="M-12,3 L12,3 L62,10 L60,22 Z" />
        <path className={art.clipper} d="M-12,-3 L12,-3 L64,-18 L66,-8 Z" />
        <path className={art.blade} d="M-13,0 H13" />
      </g>
    </svg>
    <div className={styles.meters}>
      <label>剪好 <progress max={NAIL_COUNT} value={cutCount} /> {cutCount}/{NAIL_COUNT}</label>
      <label>忍耐 <progress max={100} value={100 - view.resist} /></label>
    </div>
    <p className={`${styles.status} ${art.message}`} role="status">{message}</p>
    <button className="btn" type="button" disabled={Boolean(view.end)} onClick={() => apply({ state: nailStop(game.current), event: null })}>先剪到這裡</button>
  </>;
}
