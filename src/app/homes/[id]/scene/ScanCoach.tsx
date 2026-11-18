"use client";
// 房間掃描教練（從 3Dtest/capture_coach.html 搬來；「拍完檢查」在 VideoCheck）。
// 參考家具組裝說明書：一格一張插圖配一行短字，完整說明放在 aria-label 給螢幕閱讀器。
// 手機往下滑；電腦（≥1024px）排成一頁：上排出發前準備；下排左邊路線動畫，右邊上這樣拿、下別這樣拍，最下一列隱私說明和上傳鈕。
// 出發前準備 → 這樣拿 → 別這樣拍（都是插圖＋短字）→ 拍攝路線（自動播放的動畫）；同一件事只講一次。
// 下面固定放隱私說明和「已經拍好了，直接上傳」（電腦並排一行），錯誤訊息由 page.tsx 傳進來。
import { useEffect, useRef, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import f from "@/components/onboarding/intake.module.css";
import r from "./scene.module.css";

// ── 出發前準備：一格一張插圖＋一行短字 ──────────────────────────────

/** 橫拿的手機：中心 (x, y)，寬 w、高 h */
const Phone = ({ x, y, w = 56, h = 32, children }: { x: number; y: number; w?: number; h?: number; children?: React.ReactNode }) => (
  <g transform={`translate(${x - w / 2},${y - h / 2})`}>
    <rect width={w} height={h} rx={5} className={r.line} />
    <rect x={4} y={4} width={w - 8} height={h - 8} rx={2} className={r.screen} />
    {children}
  </g>
);

const PREP: { cap: string; label: string; art: React.ReactNode }[] = [
  { cap: "開燈、拉上窗簾", label: "打開所有燈，拉上窗簾：亮度夠又穩定就好，窗外太亮會白成一片", art: <>
    <path d="M28,6 V18 M18,26 Q28,12 38,26 Z" className={r.line} />
    <path d="M14,34 L8,40 M28,34 V42 M42,34 L48,40" className={r.ray} />
    <rect x={62} y={18} width={46} height={56} className={r.line} />
    <path d="M62,18 h23 q-4,28 0,56 h-23 Z M108,18 h-23 q4,28 0,56 h23 Z" className={r.cloth} />
  </> },
  { cap: "人和寵物離開", label: "請其他人和寵物離開畫面：會動的東西會變成模糊的鬼影", art: <>
    <rect x={84} y={10} width={28} height={68} className={r.line} />
    <circle cx={44} cy={22} r={7} className={r.line} />
    <path d="M44,29 V52 M44,52 L36,74 M44,52 L54,74 M44,36 L56,44" className={r.line} />
    <path d="M14,70 q2,-10 12,-10 h6 l3,-5 2,5 q4,2 2,10 Z" className={r.line} />
    <path d="M58,40 H78" className={r.arrowLine} markerEnd="url(#pic-tip)" />
  </> },
  { cap: "家具整個入鏡", label: "床、桌子整個拍進去：家具的四邊都要入鏡", art: <>
    <path d="M12,22 V10 H26 M94,10 H108 V22 M108,68 V80 H94 M26,80 H12 V68" className={r.ray} />
    <rect x={24} y={40} width={72} height={22} rx={3} className={r.line} />
    <rect x={24} y={26} width={10} height={36} rx={2} className={r.line} />
    <rect x={38} y={33} width={16} height={8} rx={3} className={r.cloth} />
    <path d="M28,62 V70 M92,62 V70" className={r.line} />
  </> },
  { cap: "收好證件信件", label: "收好證件和信件：入鏡的個人資料先收起來", art: <>
    <rect x={30} y={8} width={44} height={28} rx={2} className={r.line} />
    <path d="M30,8 L52,26 L74,8" className={r.line} />
    <path d="M52,40 V52" className={r.arrowLine} markerEnd="url(#pic-tip)" />
    <rect x={18} y={56} width={84} height={26} rx={2} className={r.line} />
    <path d="M18,62 H102 M52,70 h16" className={r.line} />
  </> },
  { cap: "0.5×、橫拿", label: "相機切到 0.5 倍超廣角、橫拿手機", art: <>
    <rect x={10} y={22} width={22} height={40} rx={4} className={`${r.line} ${r.faint}`} />
    <path d="M30,16 Q48,4 58,24" className={r.arrowLine} markerEnd="url(#pic-tip)" />
    <Phone x={80} y={52}><text x={28} y={21} textAnchor="middle" className={r.chip}>0.5×</text></Phone>
  </> },
  { cap: "長按鎖定對焦", label: "長按畫面鎖定對焦和曝光", art: <>
    <Phone x={60} y={44} w={84} h={50}><rect x={32} y={15} width={20} height={20} className={r.lock} /></Phone>
    <path d="M70,58 q10,-4 14,6 l4,16 h-18 l-6,-14 q-2,-6 6,-8 Z" className={r.hand} />
    <path d="M62,28 a10,10 0 0 1 20,0" className={r.ray} />
  </> },
  { cap: "1080p 30fps", label: "畫質設成 1080p 30fps，不用 4K", art: (
    <Phone x={60} y={45} w={84} h={50}>
      <text x={42} y={24} textAnchor="middle" className={r.chip}>1080p</text>
      <text x={42} y={38} textAnchor="middle" className={r.chipSoft}>30</text>
    </Phone>
  ) },
  { cap: "擦乾淨鏡頭", label: "擦一下鏡頭：指紋會讓整段影片霧霧的", art: <>
    <rect x={30} y={10} width={44} height={74} rx={7} className={r.line} />
    <circle cx={44} cy={26} r={6} className={r.line} /><circle cx={44} cy={42} r={6} className={r.line} />
    <path d="M58,22 q16,-8 30,2 q-4,14 -18,18 q-12,-6 -12,-20 Z" className={r.cloth} />
    <path d="M92,16 l8,-4 M94,30 l9,0 M92,42 l8,4" className={r.ray} />
  </> },
];

function PicDefs() {
  return (
    <svg width={0} height={0} className={r.defs} aria-hidden="true">
      <defs><marker id="pic-tip" viewBox="0 0 10 10" refX={7} refY={5} markerWidth={5} markerHeight={5} orient="auto"><path d="M0,0 L10,5 L0,10 z" className={r.tip} /></marker></defs>
    </svg>
  );
}

// ── 這樣拿（打勾）、別這樣拍（打叉），配一行短字 ────────────────────────

// 相機視野的小扇形：位置 (x, y)、朝向 ang（弧度）
function fan(x: number, y: number, ang: number, len = 22, spread = 0.42) {
  const a1 = ang - spread, a2 = ang + spread;
  const n = (v: number) => v.toFixed(2);  // 伺服器和瀏覽器的三角函數末幾位會不同，取整才不會 hydration 不一致
  return `M${x},${y} L${n(x + len * Math.cos(a1))},${n(y + len * Math.sin(a1))} A${len},${len} 0 0 1 ${n(x + len * Math.cos(a2))},${n(y + len * Math.sin(a2))} Z`;
}
/** 側面的人拿著手機；down 時手機往下 30° 拍地板 */
const Side = ({ x, down }: { x: number; down?: boolean }) => (
  <g transform={`translate(${x},0)`}>
    <path d={down ? "M16,52 L34,86 L52,86 Z" : "M16,50 L52,38 L52,62 Z"} className={r.fan} />
    <circle cx={0} cy={18} r={7} className={r.head} />
    <path d="M0,25 V58 M0,58 L-6,86 M0,58 L6,86 M0,36 L13,47" className={r.limb} />
    <rect x={12} y={43} width={4} height={11} rx={1} className={r.phone} transform={down ? "rotate(30 14 48)" : undefined} />
  </g>
);
const GOOD = <path d="M92,10 l6,6 l12,-12" className={r.ok} />;
const BAD = <path d="M94,4 l14,14 M108,4 l-14,14" className={r.bad} />;

const DOS: { cap: string; label: string; ok: boolean; art: React.ReactNode }[] = [
  { cap: "手機拿在胸前", label: "手機拿在胸前，鏡頭朝前", ok: true, art: <><line x1={0} y1={86} x2={120} y2={86} className={r.ground} /><Side x={40} /></> },
  { cap: "幾步就往下拍地板", label: "每走幾步，鏡頭往下約 30 度拍地板，貓才有地方走", ok: true, art: <><line x1={0} y1={86} x2={120} y2={86} className={r.ground} /><Side x={40} down /></> },
  { cap: "原地轉圈", label: "不要站在原地轉圈拍：相機位置沒變，電腦算不出距離", ok: false, art: <>
    {Array.from({ length: 8 }, (_, i) => <path key={i} d={fan(56, 48, i / 8 * Math.PI * 2, 36, 0.3)} className={`${r.fan} ${r.faint}`} />)}
    <path d="M56,10 A38,38 0 0 1 93,40" className={r.arrowLine} markerEnd="url(#pic-tip)" />
    <g transform="translate(56,48) rotate(-30)">
      <path d={fan(0, 0, 0, 36, 0.3)} className={r.fan} />
      <ellipse cx={-2} cy={0} rx={6} ry={11} className={r.body} />
      <circle cx={0} cy={0} r={5.5} className={r.head} />
      <rect x={7} y={-5} width={3.5} height={10} rx={1} className={r.phone} />
    </g>
  </> },
  { cap: "整個畫面只有白牆", label: "鏡頭不要近距離對著一片白牆，畫面裡沒有東西可以對位置；退遠一點，讓牆角或家具一起入鏡", ok: false, art: <>
    <rect x={70} y={6} width={30} height={80} className={r.wall2} />
    <Side x={40} />
  </> },
  { cap: "正對著鏡子長拍", label: "經過鏡子照常慢慢走，不要特地快速帶過，但不要停下來正對著鏡子拍；鏡子裡的倒影會讓 3D 多出假的房間。大面鏡子可以先用布蓋住", ok: false, art: <>
    <rect x={30} y={10} width={50} height={74} rx={4} className={r.line} />
    <path d="M40,30 L56,18 M40,50 L68,26 M50,64 L70,48" className={r.ray} />
  </> },
  { cap: "晃手機、變焦", label: "不要晃手機或快速甩鏡頭，拍到一半也不要變焦或換鏡頭", ok: false, art: <>
    <Phone x={56} y={48} />
    <path d="M18,30 q-8,18 0,36 M10,24 q-10,24 0,48 M94,30 q8,18 0,36" className={r.ray} />
  </> },
];

// ── 拍攝路線：俯視的房間，拿手機的人自己沿著牆走一圈，再從中間走一趟 ─────

// 一圈貼著牆走（離牆約 1 公尺）、繞過靠牆的家具，空的角落都要走進去
const LOOP_D = "M80,100 H22 V42 H56 V22 H138 V60 H104 V100 Z";
const MIDDLE_D = "M56,100 V46";
// 每一段：哪條路、走多久、停多久（毫秒）；鏡頭方向＝前進方向轉 face 度，或固定朝 fixed 度
const LEGS = [
  { d: LOOP_D, ms: 16000, hold: 1500, face: 90 },     // 沿牆逆時針走，右轉 90° 就是朝房間中間
  { d: MIDDLE_D, ms: 5000, hold: 1500, fixed: 180 },  // 從中間往前走，鏡頭朝左邊的牆
] as const;

function routeCaption(leg: number, t: number, turning: boolean) {
  if (leg === 1) return "從中間再走一趟，鏡頭朝牆";
  if (t <= 0) return "從門口開始錄，先停 2 秒";
  if (t >= 1) return "回到起點再停";
  return turning ? "角落要走進去，邊走邊慢慢轉" : "像在找東西一樣，沿牆慢慢走";
}

function RouteAnim() {
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [pose, setPose] = useState({ leg: 0, t: 0, x: 80, y: 100, deg: -90, turning: false });

  // 有開「減少動態效果」的人不自動播放，可以自己按播放
  useEffect(() => { setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0, leg = pose.leg, start = performance.now() - (pose.t > 0 ? LEGS[leg].hold + pose.t * LEGS[leg].ms : 0);
    const tick = (now: number) => {
      let L = LEGS[leg], e = now - start;
      if (e > L.hold + L.ms + L.hold) { leg = (leg + 1) % LEGS.length; L = LEGS[leg]; start = now; e = 0; }
      const el = paths.current[leg];
      if (el) {
        const len = el.getTotalLength(), t = Math.min(1, Math.max(0, e - L.hold) / L.ms);
        const at = (k: number) => el.getPointAtLength(Math.min(len, Math.max(0, k * len)));
        const p = at(t), back = at(t - 0.02), ahead = at(t + 0.02);
        const h1 = Math.atan2(p.y - back.y, p.x - back.x), h2 = Math.atan2(ahead.y - p.y, ahead.x - p.x);
        const heading = Math.atan2(ahead.y - back.y, ahead.x - back.x) * 180 / Math.PI;
        const turning = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) > 0.3;
        const deg = "fixed" in L ? L.fixed : t <= 0 || t >= 1 ? -90 : heading + L.face;
        setPose({ leg, t, x: p.x, y: p.y, deg, turning });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // 暫停再播放時從目前位置接著走，pose 不放進相依清單
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <div className={r.anim}>
      <svg viewBox="0 0 160 130" className={r.map} role="img" aria-label="拍攝路線：從門口開始，沿著牆走一圈、鏡頭朝房間中間，空的角落要走進去；再從中間走一趟、鏡頭朝牆；最後回到起點">
        <defs><clipPath id="route-clip"><rect x={10} y={10} width={140} height={100} /></clipPath></defs>
        <rect x={16} y={16} width={34} height={18} rx={3} className={r.furn} />
        <rect x={112} y={70} width={32} height={34} rx={3} className={r.furn} />
        <rect x={66} y={48} width={28} height={22} rx={3} className={r.furn} />
        {[LOOP_D, MIDDLE_D].map((d, i) => <path key={d} ref={el => { paths.current[i] = el; }} d={d} className={r.route} opacity={i === pose.leg ? 1 : 0.25} />)}
        <g clipPath="url(#route-clip)">
          <g transform={`translate(${pose.x},${pose.y}) rotate(${pose.deg}) scale(.7)`}>
            <path d="M8,0 L62,-30 A62,62 0 0 1 62,30 Z" className={r.fan} />
            <ellipse cx={-2} cy={0} rx={7} ry={13} className={r.body} />
            <circle cx={0} cy={0} r={6.5} className={r.head} />
            <rect x={8} y={-6} width={4} height={12} rx={1} className={r.phone} />
          </g>
        </g>
        <path d="M95,110 H150 V10 H10 V110 H65" className={r.wall} />
        <text x={80} y={124} textAnchor="middle" className={r.lbl}>門</text>
      </svg>
      <p className={r.cap}>{routeCaption(pose.leg, pose.t, pose.turning)}</p>
      <button type="button" className={r.play} onClick={() => setPlaying(p => !p)}>{playing ? "❚❚ 暫停" : "▶ 播放"}</button>
    </div>
  );
}

/** note：隱私說明（業務規則要求的聲明，決策 007）；actions：錯誤訊息；onPick：選檔上傳 */
export default function ScanCoach({ note, actions, onPick }: { note: string; actions: React.ReactNode; onPick: () => void }) {
  return (
    <div className={r.coach}>
      <PicDefs />
      <section className={`${f.card} ${r.prep}`} aria-labelledby="prep-title">
        <h2 id="prep-title" className={r.hero}>出發前準備</h2>
        <ol className={r.pics}>
          {PREP.map((p, i) => (
            <li key={p.label}>
              <svg viewBox="0 0 120 90" role="img" aria-label={p.label}>{p.art}</svg>
              <span className={r.picCap} aria-hidden="true"><b className={r.picNum}>{i + 1}</b>{p.cap}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${f.card} ${r.routeCard}`} aria-labelledby="route-title">
        <div className={r.titleRow}>
          <h2 id="route-title" className={r.hero}>拍攝路線</h2>
          <p className={r.len}>影片長度 1～3 分鐘</p>
        </div>
        <RouteAnim />
      </section>

      {([["hold", "這樣拿", true], ["dont", "別這樣拍", false]] as const).map(([key, title, ok]) => (
        <section key={key} className={`${f.card} ${r[key]}`} aria-labelledby={`${key}-title`}>
          <h2 id={`${key}-title`} className={r.hero}>{title}</h2>
          <ul className={r.pics}>
            {DOS.filter(d => d.ok === ok).map(d => (
              <li key={d.cap}>
                <svg viewBox="0 0 120 90" role="img" aria-label={d.label}>{d.art}{ok ? GOOD : BAD}</svg>
                <span className={r.picCap} aria-hidden="true">{d.cap}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className={r.ready}>
        <div className={r.readyRow}>
          <p className={f.lead}>{note}</p>
          <CatButton variant="ghost" onClick={onPick}><Icon name="plus" size={18} />已經拍好了，直接上傳</CatButton>
        </div>
        {actions}
      </div>
    </div>
  );
}
