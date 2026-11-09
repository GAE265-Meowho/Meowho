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
  if (action === "idle") return null;
  const comb = cue.includes("梳毛");
  return (
    <g className={styles.cue} transform="translate(82 6)">
      {action === "meow" && <Meow />}
      {action === "sun" && <Sun />}
      {action === "lively" && <Yarn />}
      {comb && <Comb />}
      {action === "gentle" && !comb && <Heart />}
      {action === "knead" && <Paws />}
      {action === "curious" && <Ask />}
      {action === "eat" && <Bowl />}
      {action === "clingy" && <Heart />}
      {action === "shy" && <Hide />}
      {action === "sleepy" && <Sleep />}
    </g>
  );
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
      <circle cx="14" cy="14" r="8" className={styles.yarn} />
      <path d="M8 12c4 1 6 4 4 7M10 8c6 2 8 6 5 9" className={styles.yarnLine} />
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
    <g className={styles.paw}>
      <ellipse cx="8" cy="16" rx="5" ry="4" />
      <ellipse cx="20" cy="12" rx="5" ry="4" />
    </g>
  );
}

function Ask() {
  return (
    <g>
      <circle cx="14" cy="14" r="10" className={styles.bubble} />
      <text x="14" y="18" textAnchor="middle" className={styles.cueText}>?</text>
    </g>
  );
}

function Bowl() {
  return (
    <g>
      <path d="M2 10h24c0 8-5 12-12 12S2 18 2 10z" className={styles.bowl} />
      <path d="M6 10c2-4 4-4 6 0s4 4 6 0 4-4 6 0" className={styles.bowlRim} />
    </g>
  );
}

function Hide() {
  return <path d="M2 22 14 8l12 14z" className={styles.hide} />;
}

function Sleep() {
  return <text x="4" y="18" className={styles.cueText}>z z</text>;
}
