"use client";
// 虛擬飼養第 2 份：剪指甲 2D 特寫（程式 ID：小遊戲 nail、道具 nail_paw、nail_clipper）。
// 雙手操作：一根手指按住肉球（指甲才伸出來），另一根手指拖指甲刀，放開就剪。
// 電腦：點一下肉球固定（再點一下放開）或按住空白鍵，移動滑鼠對準後按一下。
// 規則在 lib/play/mini3d/nail-rules.ts，回傳 { score, bleed, bitten, ran }。
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { playSfx } from "@/lib/play/audio-player";
import { NAIL_COUNT, NAIL_QUICK, NAIL_TEXT, nailClip, nailCutCount, nailPress, nailRelease, nailResult, nailStop, nailTick, newNail, pawCoat, type NailEvent, type NailState } from "@/lib/play/mini3d/nail-rules";
import type { MiniCtx } from "../catgame/minis";
import styles from "./mini3d.module.css";
import art from "./nail.module.css";

/** 畫面座標（viewBox 320×300）：四根腳趾的位置、指甲長度、指甲刀對到指甲的容許寬度 */
const TOES = [{ x: 74, y: 152 }, { x: 130, y: 128 }, { x: 190, y: 128 }, { x: 246, y: 152 }] as const;
const LEN = 54, AIM = 15;
const base = (i: number) => TOES[i].y - 16;
/** 手指會擋住指甲，觸控時刀口放在手指的左邊（指甲刀從右邊伸過來，不擋住指甲） */
const TOUCH_OFFSET = { x: -48, y: -10 };

/** 指甲刀的刀口對到哪一根、剪在哪裡（0＝尖端、1＝根部） */
export function aimAt(x: number, y: number): { toe: number | null; depth: number } {
  const toe = TOES.findIndex((t, i) => Math.abs(x - t.x) <= AIM && y >= base(i) - LEN - 8 && y <= base(i) + 4);
  if (toe < 0) return { toe: null, depth: 0 };
  return { toe, depth: Math.min(1, Math.max(0, (y - (base(toe) - LEN)) / LEN)) };
}

function ClawShape({ i, state }: { i: number; state: NailState }) {
  const c = state.claws[i];
  if (!c.cut && state.held !== i) return null;
  const { x } = TOES[i], y0 = base(i), left = c.depth === null ? LEN : LEN * (1 - c.depth), top = y0 - left;
  const quick = Math.min(left, LEN * (1 - NAIL_QUICK));
  return <g>
    <path className={art.claw} d={c.cut
      ? `M${x - 7},${y0} L${x - 5},${top} L${x + 5},${top} L${x + 7},${y0} Z`
      : `M${x - 7},${y0} Q${x - 6},${y0 - LEN * 0.7} ${x + 1},${top} Q${x + 7},${y0 - LEN * 0.5} ${x + 7},${y0} Z`} />
    <path className={art.quick} d={`M${x - 5},${y0} L${x - 4},${y0 - quick} L${x + 4},${y0 - quick} L${x + 5},${y0} Z`} />
    {c.cut === "bleed" && <>
      <circle className={art.blood} cx={x} cy={top} r="6" />
      <circle className={art.drip} cx={x} cy={top + 6} r="3.5" />
    </>}
  </g>;
}

/** 特寫角落的貓臉：平常、不耐煩（耳朵壓低）、哈氣（張嘴露牙） */
function Face({ mood }: { mood: "calm" | "uneasy" | "hiss" }) {
  const flat = mood !== "calm";
  return <g className={art.face} transform="translate(46,44)">
    <path className={art.fur} d={flat ? "M-27,-10 L-40,-20 L-16,-26 Z M27,-10 L40,-20 L16,-26 Z" : "M-27,-12 L-25,-40 L-8,-26 Z M27,-12 L25,-40 L8,-26 Z"} />
    <circle className={art.fur} r="30" />
    {mood === "hiss"
      ? <>
        <path className={art.line} d="M-18,-10 L-7,-5 M18,-10 L7,-5" />
        <ellipse className={art.mouth} cx="0" cy="13" rx="11" ry="9" />
        <path className={art.fang} d="M-7,6 L-4,14 L-1,6 Z M7,6 L4,14 L1,6 Z" />
      </>
      : <>
        <ellipse className={art.eye} cx="-11" cy="-5" rx="3.4" ry={flat ? 2.4 : 5} />
        <ellipse className={art.eye} cx="11" cy="-5" rx="3.4" ry={flat ? 2.4 : 5} />
        <path className={art.line} d={flat ? "M-7,13 Q0,8 7,13" : "M-8,9 Q-4,14 0,9 Q4,14 8,9"} />
      </>}
  </g>;
}

export function NailGame2D({ ctx, onDone }: { ctx: MiniCtx; onDone: (r: unknown) => void }) {
  const cat = ctx.cat;
  const [start] = useState<NailState>(newNail);
  const game = useRef(start);
  const [view, setView] = useState(start);
  const [message, setMessage] = useState("");
  const [clipper, setClipper] = useState({ x: 250, y: 60 });
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
  const mood = hissing || view.end === "bitten" || view.end === "ran" ? "hiss" : view.resist > 40 || view.pulledFor > 0 ? "uneasy" : "calm";
  const pawClass = [art.paw, view.pulledFor > 0 || view.end === "ran" ? art.pawPulled : view.resist > 45 ? art.pawTense : ""].join(" ");
  const aim = aimAt(clipper.x, clipper.y);

  return <>
    <p className={styles.hint}>{touch
      ? "一根手指按住肉球，指甲才會伸出來；另一根手指把指甲刀拖到白色尖端，放開就剪。粉紅色是血線，剪到會流血。"
      : "點一下肉球固定（或按住空白鍵），指甲才會伸出來；滑鼠移到白色尖端按一下就剪。粉紅色是血線，剪到會流血。"}</p>
    <svg ref={svg} className={art.arena} data-coat={pawCoat(ctx.coat)} viewBox="0 0 320 300" role="img" aria-label="貓掌特寫"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()}>
      <Face mood={mood} />
      <g className={pawClass}>
        {TOES.map((_, i) => <ClawShape key={i} i={i} state={view} />)}
        <path className={art.fur} d="M70,300 C62,236 78,196 160,190 C242,196 258,236 250,300 Z" />
        <ellipse className={art.fur} cx="160" cy="216" rx="116" ry="62" />
        <path className={art.patch} d="M60,222 C64,186 110,170 150,176 C132,204 104,232 62,236 Z" />
        <path className={art.patchDark} d="M212,180 C246,188 268,210 270,236 C244,236 220,216 212,180 Z" />
        <path className={art.stripe} d="M88,268 q16,-8 34,-4 M196,266 q18,-6 36,2 M118,288 q40,-10 84,0" />
        {TOES.map((t, i) => <g key={i}>
          <ellipse className={art.fur} cx={t.x} cy={t.y + 8} rx="31" ry="32" />
          <ellipse data-toe={i} cx={t.x} cy={t.y + 16} rx="21" ry="17"
            className={[art.toe, view.held === i ? art.toeHeld : "", view.claws[i].cut ? art.toeDone : ""].join(" ")} />
        </g>)}
        <path className={art.pad} d="M118,232 C116,206 140,196 160,206 C180,196 204,206 202,232 C200,254 178,262 160,254 C142,262 120,254 118,232 Z" />
      </g>
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
