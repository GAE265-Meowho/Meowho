"use client";

import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import styles from "./steps.module.css";

type Step = { station: string; icon: IconName; title: string; body: string; reward: string; Art: () => React.JSX.Element };

/* ---------- Looping flat illustrations, one per step ---------- */

function MiniCat({ className }: { className?: string }) {
  return (
    <g className={className}>
      <path className={styles.catTail} d="M64 70c22 2 30-12 24-26" fill="none" stroke="var(--orange)" strokeWidth="9" strokeLinecap="round" />
      <ellipse cx="44" cy="62" rx="26" ry="20" fill="var(--orange)" />
      <path d="M22 30 26 10 38 22ZM58 22 70 10 72 30Z" fill="var(--orange)" />
      <circle cx="46" cy="32" r="22" fill="var(--orange)" />
      <ellipse cx="38" cy="32" rx="2.6" ry="3.4" fill="var(--ink)" />
      <ellipse cx="54" cy="32" rx="2.6" ry="3.4" fill="var(--ink)" />
      <ellipse cx="46" cy="40" rx="4" ry="3" fill="#fff3df" />
    </g>
  );
}

function ScanArt() {
  return (
    <svg viewBox="0 0 400 320" className={styles.art} aria-hidden>
      <rect x="20" y="20" width="360" height="280" rx="28" fill="#fff6e4" />
      <rect x="20" y="220" width="360" height="80" fill="#f3d9b2" />
      {/* window */}
      <rect x="62" y="56" width="96" height="110" rx="10" fill="#fff" />
      <rect x="70" y="64" width="80" height="94" rx="6" fill="#fde9c0" />
      <path d="M110 64v94M70 111h80" stroke="#fff" strokeWidth="5" />
      {/* plant */}
      <path d="M300 180c-14-22-18-44-6-66 14 18 16 40 6 66Z" fill="#9cc79a" />
      <path d="M304 182c4-26 20-40 40-44-2 24-18 38-40 44Z" fill="#b6d8a8" />
      <path d="M284 182h40l-6 40h-28Z" fill="var(--orange)" />
      {/* cable */}
      <rect x="200" y="186" width="18" height="24" rx="4" fill="#fff" />
      <path d="M209 210c0 24-40 6-60 26s-50 4-70 18" fill="none" stroke="#7a6252" strokeWidth="4" strokeLinecap="round" />
      {/* scan frame + beam */}
      <g fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round">
        <path d="M44 74V44h30M326 44h30v30M356 246v30h-30M74 276H44v-30" />
      </g>
      <rect className={styles.beam} x="44" y="44" width="312" height="6" rx="3" fill="var(--yellow)" />
      {/* risk markers pop in turn */}
      {[
        { x: 110, y: 52, label: "窗戶", d: "0s" },
        { x: 312, y: 104, label: "植物", d: "0.7s" },
        { x: 120, y: 226, label: "電線", d: "1.4s" },
      ].map((m) => (
        <g key={m.label} className={styles.marker} style={{ animationDelay: m.d, transformOrigin: `${m.x}px ${m.y}px` }}>
          <circle cx={m.x} cy={m.y} r="16" fill="var(--orange)" />
          <path d={`M${m.x} ${m.y - 8}v9`} stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <circle cx={m.x} cy={m.y + 7} r="2.4" fill="#fff" />
          <rect x={m.x + 20} y={m.y - 12} width="50" height="24" rx="12" fill="var(--ink)" />
          <text x={m.x + 45} y={m.y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--yellow)">
            {m.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SevenDaysArt() {
  return (
    <svg viewBox="0 0 400 320" className={styles.art} aria-hidden>
      <rect x="20" y="20" width="360" height="280" rx="28" fill="#fff6e4" />
      <rect x="44" y="44" width="312" height="78" rx="20" fill="#fff" />
      {Array.from({ length: 7 }, (_, n) => {
        const cx = 76 + n * 41;
        return (
          <g key={n}>
            <circle cx={cx} cy="83" r="16" fill="var(--yellow-soft)" />
            <g className={styles.day} style={{ animationDelay: `${n * 0.45}s`, transformOrigin: `${cx}px 83px` }}>
              <circle cx={cx} cy="83" r="16" fill="var(--yellow)" />
              <path d={`M${cx - 7} ${83}l5 5 9-10`} fill="none" stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
        );
      })}
      <rect x="20" y="236" width="360" height="64" fill="#f3d9b2" />
      <ellipse cx="200" cy="252" rx="110" ry="16" fill="#f6c3b8" />
      <g transform="translate(130 160)">
        <MiniCat />
      </g>
      {/* bowl */}
      <path d="M242 236h52c0 14-10 22-26 22s-26-8-26-22Z" fill="var(--orange)" />
      <circle cx="258" cy="234" r="5" fill="#9b5a2c" />
      <circle cx="272" cy="232" r="5" fill="#9b5a2c" />
      {/* heart floats up */}
      <path
        className={styles.heart}
        d="M176 150c-10-8-16-13-16-20a8 8 0 0 1 16-3 8 8 0 0 1 16 3c0 7-6 12-16 20Z"
        fill="#e9767a"
      />
    </svg>
  );
}

function MoveHomeArt() {
  return (
    <svg viewBox="0 0 400 320" className={styles.art} aria-hidden>
      <rect x="20" y="20" width="360" height="280" rx="28" fill="#fff6e4" />
      <rect x="20" y="226" width="360" height="74" fill="#f3d9b2" />
      {/* 中途 house */}
      <path d="M48 150 100 110l52 40v76H48Z" fill="#fff" />
      <path d="M40 154 100 104l60 50-6 7-54-45-54 45Z" fill="var(--ink-soft)" />
      <rect x="86" y="182" width="28" height="44" rx="14" fill="var(--yellow-soft)" />
      <text x="100" y="250" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink-soft)">
        中途時期
      </text>
      {/* 新家 */}
      <path d="M248 150 300 110l52 40v76H248Z" fill="#fff" />
      <path d="M240 154 300 104l60 50-6 7-54-45-54 45Z" fill="var(--orange)" />
      <rect x="286" y="182" width="28" height="44" rx="14" fill="var(--yellow)" />
      <text x="300" y="250" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--orange-deep)">
        新家時期
      </text>
      <path d="M150 214H250" stroke="var(--yellow-deep)" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" />
      {/* application card gets approved */}
      <g className={styles.card} style={{ transformOrigin: "200px 92px" }}>
        <rect x="166" y="56" width="68" height="72" rx="10" fill="#fff" stroke="var(--line)" strokeWidth="2" />
        <path d="M178 76h44M178 88h44M178 100h28" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
        <g className={styles.stamp} style={{ transformOrigin: "222px 116px" }}>
          <circle cx="222" cy="116" r="17" fill="var(--orange)" />
          <path d="M214 116l6 6 10-12" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      {/* the cat walks over to its new home */}
      <g className={styles.walker}>
        <g transform="translate(118 168) scale(0.55)">
          <MiniCat />
        </g>
      </g>
    </svg>
  );
}

const steps: Step[] = [
  {
    station: "AR 環境報告站",
    icon: "scan",
    title: "打造喵星人安全窩",
    body: "拍一段家裡的影片或照片，AI 標出窗戶、電線、植物等「可能風險」，產出飼養環境建議報告；看不清楚的地方會直接說看不出來。",
    reward: "完成居家環境報告",
    Art: ScanArt,
  },
  {
    station: "3D 養貓中心",
    icon: "yarn",
    title: "7 天虛擬飼養",
    body: "跟想領養那隻貓的虛擬分身同居 7 天：半夜跑酷、吐毛球、挑食，都是中途日記裡牠真實的習慣。",
    reward: "拿到虛擬飼養完成徽章",
    Art: SevenDaysArt,
  },
  {
    station: "帶我回家領養站",
    icon: "key",
    title: "提出申請，移轉回家",
    body: "完成第 1 或第 2 關就能送出申請，有養貓經驗可以直接申請；喵戶長審核後，貓咪移轉到你的喵戶，時光小屋也跟著搬家。",
    reward: "牠的時光小屋跟著搬家",
    Art: MoveHomeArt,
  },
];

/**
 * Pinned walkthrough: the panel sticks while the visitor scrolls through a tall
 * track, and each third of the track swaps in the next step.
 */
export default function Steps() {
  const track = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = track.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = clamp01(-r.top / Math.max(r.height - window.innerHeight, 1));
      const next = Math.min(steps.length - 1, Math.floor(p * steps.length));
      setActive((cur) => (cur === next ? cur : next));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const jumpTo = (n: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((n + 0.5) / steps.length) * (el.offsetHeight - window.innerHeight) });
  };

  const step = steps[active];

  return (
    <section id="steps" ref={track} className={styles.track} aria-labelledby="steps-title">
      <div className={styles.pin}>
        <div className={`wrap ${styles.grid}`}>
          <div className={styles.stage}>
            {steps.map((s, n) => (
              <div key={s.title} className={`${styles.artWrap} ${n === active ? styles.show : ""}`} aria-hidden={n !== active}>
                <s.Art />
              </div>
            ))}
          </div>

          <div className={styles.text}>
            <p className={styles.kicker}>
              <Icon name="badge" size={16} />
              負責任的相遇
            </p>
            <h2 id="steps-title">
              <span>三步通關，</span>
              <span>準備好再帶牠回家</span>
            </h2>

            <ol className={styles.dots} aria-label="三個關卡">
              {steps.map((s, n) => (
                <li key={s.title}>
                  <button type="button" aria-current={n === active ? "step" : undefined} className={n === active ? styles.dotOn : n < active ? styles.dotDone : undefined} onClick={() => jumpTo(n)}>
                    <span>{n < active ? <Icon name="check" size={14} /> : n + 1}</span>
                    {s.station}
                  </button>
                </li>
              ))}
            </ol>

            <div key={active} className={styles.content} aria-live="polite">
              <p className={styles.no}>
                第 {active + 1} 關<small> / 3</small>
              </p>
              <h3>
                <Icon name={step.icon} size={26} />
                {step.title}
              </h3>
              <p className={styles.body}>{step.body}</p>
              <p className={styles.reward}>
                <Icon name="badge" size={16} />
                {step.reward}
              </p>
            </div>

            {/* 規則（不顯示在前台）：喵戶長可以設定「必須完成 7 天虛擬飼養」，設定後有經驗者也要做。 */}
          </div>
        </div>
      </div>
    </section>
  );
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
