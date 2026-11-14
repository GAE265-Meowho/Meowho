"use client";
// 小遊戲開始前的示範（#354，渝茜 2026-11-14）。內容在 lib/play/mini-guide.ts。
// 有錄影（真正的遊戲畫面，mini-guide.ts 的 video）就放影片（靜音、循環、自動播放；prefers-reduced-motion 時不自動播、給控制列），旁邊列出全部步驟；
// 沒有錄影（逗貓）才用下面的動畫示範圖：
// 幾張示範圖自動輪播（GUIDE_STEP_MS 換一張，也可以點下面的圓點），每張是簡單的插圖＋會動的手，示範要按住、畫圈、拖曳還是點；
// 下面一句說明。「下次不再顯示」勾了就記在這台裝置，之後直接開始。prefers-reduced-motion 時手不動、不自動輪播。
// MiniGuideGate：示範看完才顯示 children（小遊戲本體）；modal＝自己包一層 Mini3DModal（原版 2D 小遊戲、3D 逗貓用）。
import { useEffect, useId, useState, type ReactNode } from "react";
import CatButton from "@/components/ui/CatButton";
import { GUIDE_STEP_MS, MINI_GUIDES, guideSkipped, guideText, setGuideSkipped, type GuideId, type GuideProp, type GuideStep } from "@/lib/play/mini-guide";
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
    case "carrier":
      return <g>
        <rect x="132" y="56" width="80" height="58" rx="8" fill="#f2e6d6" stroke="var(--line)" strokeWidth="3" />
        <path d="M132 70v34" stroke="var(--caramel)" strokeWidth="4" />
        <circle cx="172" cy="85" r="34" fill="none" stroke="#e05a4f" strokeWidth="2" strokeDasharray="5 4" opacity=".7" />
        {[40, 72, 104].map(x => <circle key={x} cx={x} cy="110" r="5" fill="#c98b4a" className={g.treat} />)}
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
    case "carrier": return [60, 110];
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
        <div className={g.videoRow}>
          <VideoDemo src={guide.video} label={`${guide.title}的遊戲畫面示範`} />
          <ol className={g.list}>
            {guide.steps.map((st, k) => <li key={k}><span className={g.num}>{k + 1}</span>{guideText(st.text, catName)}</li>)}
          </ol>
        </div>
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

/** 真正遊戲畫面的錄影：靜音循環自動播放；減少動態時不自動播，改給控制列 */
function VideoDemo({ src, label }: { src: string; label: string }) {
  const [still] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  return <video className={g.video} src={src} aria-label={label} muted loop playsInline autoPlay={!still} controls={still} preload="auto" />;
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
