import type { ReactNode } from "react";
import type { ActionKey, CoatKey } from "@/lib/adopt-map";
import styles from "./catSprite.module.css";

type Props = { coat: CoatKey; action: ActionKey; /** 觸發這個動作的標籤，用來決定旁邊的小圖示 */ cue?: string };

/** 貓本體保持靜止，動作用旁邊的小圖示表示。 */
export default function CatSprite({ coat, action, cue = "" }: Props) {
  const stripes = coat === "tabby" || coat === "silverTabby" || coat === "orange" || coat === "orangeWhite";
  return (
    <svg viewBox="0 0 118 96" className={`${styles.svg} ${styles[coat]}`} aria-hidden>
      <ellipse className={styles.shadow} cx="48" cy="86" rx="22" ry="4.5" />
      <g>
        <path className={styles.tail} d="M24 62c-12 1-16 16-8 20 7 3 14-6 11-12" />
        <ellipse className={styles.body} cx="48" cy="64" rx="23" ry="15" />
        <ellipse className={styles.belly} cx="52" cy="69" rx="12" ry="8" />
        {stripes && (
          <g className={styles.stripes}>
            <path d="M32 58c8 4 12 4 18 0" />
            <path d="M34 64c8 4 14 4 20 0" />
            <path d="M40 71c6 3 10 3 14 0" />
          </g>
        )}
        {(coat === "calico" || coat === "tortie") && (
          <g className={styles.patches}>
            <ellipse cx="36" cy="60" rx="8" ry="6" />
            <ellipse cx="62" cy="66" rx="7" ry="5" />
          </g>
        )}
        <g className={styles.paws}>
          <ellipse cx="36" cy="77" rx="6.5" ry="3.6" />
          <ellipse cx="54" cy="78" rx="6.5" ry="3.6" />
        </g>
        <g>
          <path className={styles.ear} d="M32 46 35 26 46 42Z" />
          <path className={styles.ear} d="M64 42 73 24 78 48Z" />
          <path className={styles.inner} d="M35 42 37 32 43 41Z" />
          <path className={styles.inner} d="M66 41 71 30 74 45Z" />
          <ellipse className={styles.face} cx="54" cy="48" rx="19" ry="16" />
          {(coat === "tuxedo" || coat === "orangeWhite" || coat === "calico" || coat === "point" || coat === "white") && (
            <ellipse className={styles.muzzle} cx="56" cy="53" rx="9" ry="6.5" />
          )}
          <ellipse className={styles.eye} cx="46" cy="47" rx="3" ry="3.4" />
          <ellipse className={styles.eye} cx="62" cy="47" rx="3" ry="3.4" />
          <ellipse className={styles.pupil} cx="46.6" cy="47.4" rx="1.3" ry="1.8" />
          <ellipse className={styles.pupil} cx="62.6" cy="47.4" rx="1.3" ry="1.8" />
          <ellipse className={styles.nose} cx="54" cy="53" rx="2.1" ry="1.5" />
          <path className={styles.mouth} d="M54 54.4c-2.2 2.2-4.2 2-5.4.8M54 54.4c2.2 2.2 4.2 2 5.4.8" />
        </g>
      </g>
      <Cue action={action} cue={cue} />
    </svg>
  );
}

function Cue({ action, cue }: { action: ActionKey; cue: string }) {
  if (cue.includes("叫")) return <Mark><Meow /></Mark>;
  if (cue.includes("曬")) return <Mark><Sun /></Mark>;
  if (cue.includes("梳")) return <Mark><Comb /></Mark>;
  if (cue.includes("好奇")) return <Mark><Ask /></Mark>;
  if (cue.includes("慢熟") || cue.includes("慢熱")) return <Mark><Shy /></Mark>;
  if (cue.includes("怕生") || cue.includes("膽小")) return <Mark><Hide /></Mark>;
  if (cue.includes("踏") || cue.includes("踩")) return <Mark><Paws /></Mark>;
  if (cue.includes("貪吃")) return <Mark><Bowl /></Mark>;
  if (cue.includes("活潑") || cue.includes("愛玩")) return <Mark><Yarn /></Mark>;
  if (cue.includes("慵懶") || cue.includes("安靜")) return <Mark><Sleep /></Mark>;
  if (cue.includes("獨立")) return <Mark><Alone /></Mark>;
  if (action === "clingy" || cue.includes("黏") || cue.includes("親人") || cue.includes("撒嬌") || cue.includes("溫和") || cue.includes("輕柔") || cue.includes("被抱")) return <Mark><Heart /></Mark>;
  return null;
}

function Mark({ children }: { children: ReactNode }) {
  return <g className={styles.cue} transform="translate(74 8)">{children}</g>;
}

function Meow() {
  return (
    <g>
      <rect x="0" y="0" width="30" height="18" rx="9" className={styles.bubble} />
      <path d="M8 16 l3 7 7-7" className={styles.bubble} />
      <text x="15" y="13" textAnchor="middle" className={styles.cueText}>喵</text>
    </g>
  );
}

function Sun() {
  return (
    <g>
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="14" y1="4" x2="14" y2="0" transform={`rotate(${i * 45} 14 14)`} className={styles.sunRay} />
      ))}
      <circle cx="14" cy="14" r="6" className={styles.sun} />
    </g>
  );
}

function Yarn() {
  return (
    <g>
      <line x1="1.5" y1="25" x2="15" y2="8.5" className={styles.wandOutline} />
      <line x1="1.5" y1="25" x2="15" y2="8.5" className={styles.wandStick} />
      <path d="M15 8.5c5.2-.2 8.2 3.4 6.2 7.6" className={styles.wandString} />
      <ellipse className={styles.feather} cx="22.4" cy="17.6" rx="2.5" ry="6.6" transform="rotate(20 22.4 17.6)" />
      <ellipse className={styles.featherGold} cx="26.2" cy="16" rx="2.3" ry="6" transform="rotate(42 26.2 16)" />
      <ellipse className={styles.feather} cx="19.4" cy="19" rx="2.2" ry="5.4" transform="rotate(-6 19.4 19)" />
      <circle cx="21.8" cy="16.6" r="3" className={styles.wandPom} />
      <ellipse className={styles.shine} cx="20.8" cy="15.6" rx="1" ry="0.6" />
    </g>
  );
}

function Comb() {
  return (
    <g>
      <rect x="2" y="4" width="22" height="7" rx="2" className={styles.comb} />
      <path d="M6 11v8M11 11v8M16 11v8M21 11v8" className={styles.combTeeth} />
    </g>
  );
}

function Heart() {
  return <path d="M14 24c-6-4-10-8-10-12a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 4-4 8-10 12z" className={styles.heart} />;
}

function Paws() {
  return (
    <g>
      <ellipse className={styles.toe} cx="5.4" cy="9.4" rx="3.3" ry="4.1" transform="rotate(-24 5.4 9.4)" />
      <ellipse className={styles.toe} cx="11.2" cy="5.4" rx="3.3" ry="4.3" transform="rotate(-8 11.2 5.4)" />
      <ellipse className={styles.toe} cx="17.6" cy="5.4" rx="3.3" ry="4.3" transform="rotate(8 17.6 5.4)" />
      <ellipse className={styles.toe} cx="23.4" cy="9.4" rx="3.3" ry="4.1" transform="rotate(24 23.4 9.4)" />
      <path className={styles.pad} d="M14 12.4c-6.4.4-10 3.4-10 7.2 0 2.5 1.7 4.2 4 4.8 1.3.3 2.2-.5 3.4-1 .9.7 2.2 1 2.6 1s1.7-.3 2.6-1c1.2.5 2.1 1.3 3.4 1 2.3-.6 4-2.3 4-4.8 0-3.8-3.6-6.8-10-7.2z" />
      <ellipse className={styles.shine} cx="8.6" cy="8.2" rx="1.1" ry="0.7" transform="rotate(-24 8.6 8.2)" />
      <ellipse className={styles.shine} cx="12.2" cy="17.2" rx="2.4" ry="1.3" />
    </g>
  );
}

function QMark({ x, y, rot, scale = 1 }: { x: number; y: number; rot: number; scale?: number }) {
  const d = "M2.2 7.4C2.2 2.6 11.2 2.2 11.2 7.2 11.2 10.8 7.2 11.2 7 14.8";
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot} 6.6 9) scale(${scale})`}>
      <path d={d} className={styles.qOutline} />
      <path d={d} className={styles.qMark} />
      <circle cx="6.8" cy="18" r="2.35" className={styles.qDotOutline} />
      <circle cx="6.8" cy="18" r="1.45" className={styles.qDot} />
    </g>
  );
}

function Ask() {
  return (
    <g>
      <QMark x={7} y={-1} rot={-12} />
      <QMark x={-1} y={11} rot={-26} scale={0.78} />
      <QMark x={16} y={10} rot={18} scale={0.84} />
    </g>
  );
}

function Bowl() {
  return (
    <g>
      <g className={styles.kibble}>
        <circle cx="8" cy="9.2" r="2.7" />
        <circle cx="13.2" cy="6.6" r="3" />
        <circle cx="18.6" cy="5.8" r="3.15" />
        <circle cx="23.6" cy="8" r="2.7" />
        <circle cx="10.6" cy="12.4" r="2.55" />
        <circle cx="16" cy="11" r="2.85" />
        <circle cx="21.2" cy="12" r="2.55" />
      </g>
      <path className={styles.bowl} d="M1.2 15.2h27.6c-.7 8.2-5.8 13-13.8 13S1.9 23.4 1.2 15.2z" />
      <ellipse className={styles.bowlRim} cx="15" cy="15.2" rx="13.9" ry="3.5" />
      <g className={styles.kibble}>
        <circle cx="7.6" cy="14.6" r="2.45" />
        <circle cx="12.4" cy="13.4" r="2.65" />
        <circle cx="17.6" cy="13.1" r="2.75" />
        <circle cx="22.4" cy="14.2" r="2.4" />
      </g>
      <ellipse className={styles.shine} cx="17.2" cy="6.4" rx="1.15" ry="0.7" />
    </g>
  );
}

function Shy() {
  return (
    <g transform="rotate(-10 16 11)">
      <rect x="-1.5" y="1" width="36" height="16.5" rx="8.2" className={styles.shyBubble} />
      <text x="16.5" y="12.6" textAnchor="middle" className={styles.shyText}>{">///<"}</text>
    </g>
  );
}

function Alone() {
  return <circle cx="14" cy="14" r="4" className={styles.yarn} />;
}

function Hide() {
  return (
    <g>
      <path d="M2 20 14 8l12 12v6H2z" className={styles.hide} />
      <circle cx="14" cy="16" r="2" className={styles.pupil} />
    </g>
  );
}

function Sleep() {
  return <text x="2" y="18" className={styles.cueText}>z z</text>;
}
