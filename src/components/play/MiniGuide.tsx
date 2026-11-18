"use client";
// 小遊戲開始前的示範（#354，渝茜 2026-11-14）。內容在 lib/play/mini-guide.ts。
// 有錄影（真正的遊戲畫面，mini-guide.ts 的 video）就放影片（靜音、循環、自動播放；prefers-reduced-motion 時不自動播、給控制列），旁邊列出全部步驟；
// 沒有錄影（逗貓）才用下面的動畫示範圖：
// 幾張示範圖自動輪播（GUIDE_STEP_MS 換一張，也可以點下面的圓點），每張是簡單的插圖＋會動的手，示範要按住、畫圈、拖曳還是點；
// 下面一句說明。「下次不再顯示」勾了就記在這台裝置，之後直接開始。prefers-reduced-motion 時手不動、不自動輪播。
// MiniGuideGate：示範看完才顯示 children（小遊戲本體）；modal＝自己包一層 Mini3DModal（原版 2D 小遊戲、3D 逗貓用）。
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import CatButton from "@/components/ui/CatButton";
import { BRUSH_PRELOAD, GUIDE_STEP_MS, GUIDE_VIDEOS, MINI_GUIDES, cueAt, guidePart, guideSkipped, guideText, setGuideSkipped, toyAt, type GuideCue, type GuideId, type GuideProp, type GuideStep, type MiniGuide } from "@/lib/play/mini-guide";
import { useTouch } from "./useTouch";
import { Mini3DModal } from "./mini3d/Mini3DModal";
import g from "./guide.module.css";

/** 示範圖的道具（viewBox 0 0 240 150；按鈕畫在右下 150～230, 112～138） */
function Prop({ id }: { id: GuideProp }) {
  switch (id) {
    case "bowl":
    case "dirtyBowl":
      return <g>
        <ellipse cx="90" cy="96" rx="58" ry="14" fill="var(--line)" />
        <path d="M32 82h116l-10 26H42z" fill="var(--caramel)" />
        <ellipse cx="90" cy="82" rx="58" ry="12" fill="#f6e3c7" />
        {id === "bowl" ? <g fill="#a8693a"><circle cx="78" cy="80" r="4" /><circle cx="90" cy="78" r="4" /><circle cx="100" cy="82" r="4" /><circle cx="86" cy="84" r="4" /></g>
          : <g fill="#bba98d" opacity=".8"><circle cx="70" cy="80" r="6" /><circle cx="104" cy="83" r="5" /><circle cx="92" cy="77" r="4" /></g>}
      </g>;
    case "tap":
      return <g>
        <rect x="40" y="18" width="16" height="44" rx="4" fill="#b9c2c9" />
        <path d="M48 30h44v12H60v14H48z" fill="#cfd6db" />
        <path d="M86 42v10" stroke="#7fb8e6" strokeWidth="6" strokeLinecap="round" strokeDasharray="4 4" className={g.water} />
        <ellipse cx="88" cy="98" rx="40" ry="10" fill="var(--line)" />
        <path d="M48 86h80l-8 18H56z" fill="var(--caramel)" />
        <ellipse cx="88" cy="86" rx="40" ry="8" fill="#cfe7f7" />
      </g>;
    case "litter":
    case "bag":
      return <g>
        {id === "bag" && <path d="M14 60h38l-4 66H18z" fill="#6f8f6a" />}
        <rect x="64" y="70" width="110" height="46" rx="8" fill="var(--caramel)" />
        <rect x="70" y="72" width="98" height="18" rx="6" fill="#efe1c6" />
        <circle cx="96" cy="80" r="6" fill="#d2c3a4" /><circle cx="140" cy="82" r="5" fill="#8a5a3c" />
        <path d="M118 40l26 8-4 12-26-8z" fill="#7cb3a3" /><path d="M140 52l40 22" stroke="#7cb3a3" strokeWidth="6" strokeLinecap="round" />
      </g>;
    case "cat":
      return <g>
        <ellipse cx="110" cy="96" rx="56" ry="26" fill="#b0a089" />
        <circle cx="60" cy="72" r="24" fill="#b0a089" />
        <path d="M42 56l4-20 14 14zM78 56l-4-20-14 14z" fill="#b0a089" />
        <path d="M52 70q3-4 6 0M66 70q3-4 6 0" stroke="var(--ink)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M164 96q24-8 18-34" stroke="#b0a089" strokeWidth="10" fill="none" strokeLinecap="round" />
      </g>;
    case "mouth":
      return <g>
        <circle cx="96" cy="72" r="46" fill="#b0a089" />
        <path d="M66 82q30 28 60 0z" fill="#8c4b4b" />
        <path d="M70 83h52" stroke="#fff" strokeWidth="5" strokeDasharray="6 3" />
        <path d="M150 50l50 40" stroke="#7cb3a3" strokeWidth="8" strokeLinecap="round" />
      </g>;
    case "paw":
      return <g>
        <ellipse cx="100" cy="88" rx="40" ry="34" fill="#b0a089" />
        <ellipse cx="100" cy="98" rx="16" ry="12" fill="#f1a7b2" />
        {[72, 92, 112, 130].map(x => <g key={x}><circle cx={x} cy="66" r="8" fill="#f1a7b2" /><path d={`M${x} 58l-3-14h6z`} fill="#fff" stroke="#e9b9c0" /></g>)}
      </g>;
    case "toy":
      return <g>
        <rect x="10" y="102" width="220" height="30" rx="6" fill="#e9dcc6" />
        <g className={g.toy}><ellipse cx="0" cy="0" rx="12" ry="7" fill="#9aa0a6" /><circle cx="10" cy="-4" r="4" fill="#9aa0a6" /><path d="M-12 0q-10 6-16 0" stroke="#9aa0a6" strokeWidth="2" fill="none" /></g>
      </g>;
  }
}

/** 手：手指尖在 (0,0)；外層 g 決定位置，className 決定動作 */
const Hand = ({ gesture }: { gesture: GuideStep["gesture"] }) => (
  <g className={`${g.hand} ${g[gesture]}`}>
    <circle r="12" className={g.ring} fill="none" stroke="var(--orange)" strokeWidth="3" />
    <path d="M0 0c-3-6-2-14 3-14s5 6 5 10v-6c0-4 6-4 6 0v6c0-4 6-4 6 0v6c0-3 5-3 5 1v14c0 10-8 16-16 16h-4C-2 33-8 27-10 20l-6-12c-2-4 3-7 6-4z"
      fill="#fff" stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round" transform="scale(0.7) translate(-3 14)" />
  </g>
);

/** 手的起點：有按鈕就在按鈕上，否則依道具 */
function handAt(step: GuideStep): [number, number] {
  // 按在按鈕右半邊，不蓋住按鈕上的字
  if (step.button) return [214, 128];
  switch (step.prop) {
    case "bowl": case "dirtyBowl": return [90, 80];
    case "litter": return [100, 80];
    case "bag": return [140, 60];
    case "cat": return [80, 86];
    case "mouth": return [96, 84];
    case "paw": return [100, 96];
    case "tap": return [214, 128];
    case "toy": return [60, 70];
  }
}

function Slide({ step }: { step: GuideStep }) {
  const [x, y] = handAt(step);
  return (
    <svg viewBox="0 0 240 150" className={g.svg} aria-hidden="true">
      <rect width="240" height="150" rx="14" fill="var(--yellow-soft, #fff6e0)" />
      <Prop id={step.prop} />
      {step.button && <g><rect x="150" y="112" width="80" height="28" rx="14" fill="var(--caramel)" /><text x="190" y="131" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{step.button}</text></g>}
      <g transform={`translate(${x} ${y})`}><Hand gesture={step.gesture} /></g>
    </svg>
  );
}

function GuideCard({ id, catName, onStart }: { id: GuideId; catName: string; onStart: () => void }) {
  const guide = MINI_GUIDES[id];
  const [i, setI] = useState(0);
  const [skip, setSkip] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI(v => (v + 1) % guide.steps.length), GUIDE_STEP_MS);
    return () => clearTimeout(t);
  }, [i, guide.steps.length]);
  const step = guide.steps[i];
  const start = () => { setGuideSkipped(id, skip); onStart(); };
  const foot = (
    <div className={g.foot}>
      <label className={g.skip}><input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />下次不再顯示</label>
      <CatButton onClick={start}>開始</CatButton>
    </div>
  );
  if (guide.video) {
    return (
      <div className={g.card} role="group" aria-labelledby={titleId}>
        <p className={g.kicker} id={titleId}>{guide.title}怎麼玩</p>
        {/* 2026-11-18 渝茜：說明疊在錄影上、跟著影片換步驟，下面不再列文字（步驟只留給螢幕報讀） */}
        <VideoDemo src={guide.video} label={`${guide.title}的遊戲畫面示範`} guide={guide} catName={catName} />
        <ol className={g.srOnly}>
          {guide.steps.map((st, k) => <li key={k}>{guideText(st.text, catName)}</li>)}
        </ol>
        {foot}
      </div>
    );
  }
  return (
    <div className={g.card} role="group" aria-labelledby={titleId}>
      <p className={g.kicker} id={titleId}>{guide.title}怎麼玩</p>
      <div className={g.stage}>
        <Slide key={i} step={step} />
      </div>
      <p className={g.text} aria-live="polite"><span className={g.num}>{i + 1}</span>{guideText(step.text, catName)}</p>
      <div className={g.dots} role="tablist" aria-label="示範步驟">
        {guide.steps.map((_, k) => <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={`第 ${k + 1} 步`} className={g.dot} onClick={() => setI(k)} />)}
      </div>
      {foot}
    </div>
  );
}

/** 預載好的示範影片（網址 → blob 網址）：打開示範時直接從記憶體播，不用等下載（2026-11-14 渝茜：錄影很慢才出現） */
const warmed = new Map<string, string>();
let warming = false;
/** 遊戲一開始（進到採買、擺用品之前就）呼叫一次：在背景把全部示範影片（約 570KB）抓進記憶體，刷牙的大圖與轉頭影片也先抓（#456：原本到飼養才開始抓，第一個小遊戲還在等） */
export function warmGuideVideos() {
  if (warming || typeof window === "undefined" || typeof URL.createObjectURL !== "function") return;
  warming = true;
  for (const url of BRUSH_PRELOAD.images) { const img = new Image(); img.decoding = "async"; img.src = url; }
  for (const url of BRUSH_PRELOAD.videos) fetch(url).catch(() => { /* 抓不到就等開始刷牙時再載 */ });
  for (const src of GUIDE_VIDEOS) {
    fetch(src).then(r => (r.ok ? r.blob() : null)).then(b => { if (b) warmed.set(src, URL.createObjectURL(b)); }).catch(() => { /* 抓不到就照原本的網址播 */ });
  }
}

const NO_CUES: GuideCue[] = [];

/** 說明文字：[動作] 黃色標籤、{按鍵} 鍵帽、換行 */
function CueText({ text, catName }: { text: string; catName: string }) {
  return <>{guidePart(guideText(text, catName)).map((p, i) => p.k === "br" ? <br key={i} />
    : p.k === "verb" ? <span key={i} className={g.verb}>{p.s}</span>
      : p.k === "key" ? <kbd key={i} className={g.key}>{p.s}</kbd> : <Fragment key={i}>{p.s}</Fragment>)}</>;
}

/**
 * 真正遊戲畫面的錄影＋疊在上面的說明（渝茜 2026-11-18）：
 *   電腦：深色對話框指著要操作的地方（目標在下半部時框放上面），按鍵畫成鍵帽；手機：畫面小，改成影片上方或下方的大字幕＋橘色圓圈標位置。
 *   有 hold 的步驟播到那裡先停格，讓字看得完；逗貓另外畫老鼠與游標（錄影裡看不到）。
 * 減少動態時不自動播、給控制列；字照樣跟著影片時間換。
 */
function VideoDemo({ src, label, guide, catName }: { src: string; label: string; guide: MiniGuide; catName: string }) {
  const [still] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const touch = useTouch();
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const call = useRef<HTMLDivElement>(null);
  const toy = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const cues = guide.cues ?? NO_CUES;
  const cue: GuideCue | undefined = cues[i];

  // 跟著影片時間換說明；遇到 hold 就停格一下（每輪播放各停一次）
  useEffect(() => {
    const v = video.current;
    if (!v || !cues.length) return;
    v.playbackRate = v.defaultPlaybackRate = guide.rate ?? 1;
    const held = new Set<number>();
    let prev = 0, raf = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const t = v.currentTime;
      if (t < prev - 0.5) held.clear();
      prev = t;
      const k = cueAt(cues, t), c = cues[k];
      setI(k);
      if (c.hold && !still && !held.has(k) && t >= c.hold[0] && !v.paused) {
        held.add(k); v.pause();
        timer = setTimeout(() => { v.play().catch(() => { /* 使用者自己暫停了 */ }); }, c.hold[1] * 1000);
      }
      if (guide.toy && toy.current) {
        const [x, y] = toyAt(guide.toy, t);
        toy.current.style.left = `${x}%`; toy.current.style.top = `${y}%`; toy.current.style.opacity = y > 100 ? "0" : "1";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (timer) clearTimeout(timer); };
  }, [cues, guide.rate, guide.toy, still]);

  // 電腦版的對話框：放在目標下方（目標在下半部就放上方），不超出影片左右
  useLayoutEffect(() => {
    const el = call.current, box = wrap.current;
    if (!el || !box || !cue) return;
    const W = box.clientWidth, H = box.clientHeight, w = el.offsetWidth, h = el.offsetHeight;
    if (cue.x === undefined || cue.y === undefined) { el.style.left = `${(W - w) / 2}px`; el.style.top = "12px"; el.dataset.dir = "free"; return; }
    const tx = (cue.x / 100) * W, ty = (cue.y / 100) * H, up = cue.y > 58;
    const left = Math.max(8, Math.min(W - w - 8, tx - w / 2));
    el.style.left = `${left}px`;
    el.style.top = `${up ? ty - 34 - h : ty + 34}px`;
    el.style.setProperty("--ax", `${Math.max(14, Math.min(w - 14, tx - left))}px`);
    el.dataset.dir = up ? "up" : "down";
  }, [cue, touch]);

  const text = cue ? (touch ? cue.m ?? cue.d : cue.d) : "";
  const ring = cue && cue.x !== undefined && cue.tone !== "good";
  return (
    <div className={g.vwrap} ref={wrap} data-touch={touch}>
      <video ref={video} className={g.video} src={warmed.get(src) ?? src} aria-label={label} muted loop playsInline autoPlay={!still} controls={still} preload="auto" />
      {guide.toy && (
        <div ref={toy} className={g.toyMouse} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- 128px 的小圖，疊在影片上跟著動 */}
          <img src="/play/guide/toy-mouse.webp" alt="" width={64} height={40} />
          {!touch && <svg className={g.toyCursor} viewBox="0 0 17 23" width="20" height="27"><path d="M1 1v17.5l4.4-4.2 2.9 6.8 3-1.3-2.9-6.6H15z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" /></svg>}
        </div>
      )}
      {cue && (
        <div aria-live="polite">
          {ring && <span className={g.target} data-tone={cue.tone} style={{ left: `${cue.x}%`, top: `${cue.y}%` }} aria-hidden="true" />}
          {cue.w && !touch && <span className={g.warnTag}>⚠ {cue.w}</span>}
          {cue.tip && !touch && <span className={g.tipTag}>{cue.tip}</span>}
          {touch ? (
            <div className={g.cap} data-tone={cue.tone} data-at={(cue.y ?? 0) > 58 ? "top" : "bottom"}>
              {cue.step && <b className={g.stepHead}>{cue.step}</b>}
              <CueText text={text} catName={catName} />
              {cue.w && <span className={g.capWarn}>⚠ {cue.w}</span>}
              {cue.tip && <span className={g.capTip}>{cue.tip}</span>}
            </div>
          ) : (
            <div ref={call} className={g.call} data-tone={cue.tone}>
              {cue.step && <b className={g.stepHead}>{cue.step}</b>}
              <CueText text={text} catName={catName} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 示範看完才顯示小遊戲；這台裝置勾過「下次不再顯示」就直接顯示 */
export function MiniGuideGate({ id, catName, modal, onCancel, children }: {
  id: GuideId; catName: string; children: ReactNode;
  /** 自己包一層彈窗（原版 2D 小遊戲、3D 逗貓） */
  modal?: { title: string };
  /** 彈窗右上角關掉：不玩了 */
  onCancel?: () => void;
}) {
  const [show, setShow] = useState(() => !guideSkipped(id));
  if (!show) return <>{children}</>;
  const card = <GuideCard id={id} catName={catName} onStart={() => setShow(false)} />;
  return modal ? <Mini3DModal title={modal.title} onCancel={onCancel ?? (() => setShow(false))}>{card}</Mini3DModal> : card;
}
