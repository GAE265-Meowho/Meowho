import type { ActionKey, CoatKey } from "@/lib/adopt-map";
import styles from "./catSprite.module.css";

type Props = { coat: CoatKey; action: ActionKey };

/** 卡片毛色＋一個動作。裝飾用，名字由外層按鈕報讀。 */
export default function CatSprite({ coat, action }: Props) {
  const stripes = coat === "tabby" || coat === "silverTabby" || coat === "orange" || coat === "orangeWhite";
  return (
    <svg viewBox="0 0 96 88" className={`${styles.svg} ${styles[coat]} ${styles[action]}`} aria-hidden>
      {action === "sun" && (
        <g className={styles.rays}>
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i * 45} x1="78" y1="16" x2="78" y2="5" transform={`rotate(${i * 45} 78 16)`} />
          ))}
          <circle cx="78" cy="16" r="5.5" />
        </g>
      )}
      <ellipse className={styles.shadow} cx="48" cy="79" rx="22" ry="4.5" />
      <g className={styles.actor}>
        <g className={styles.tailWrap}>
          <path className={styles.tail} d="M24 56c-12 1-16 16-8 20 7 3 14-6 11-12" />
        </g>
        <ellipse className={styles.body} cx="48" cy="58" rx="23" ry="15" />
        <ellipse className={styles.belly} cx="52" cy="63" rx="12" ry="8" />
        {stripes && (
          <g className={styles.stripes}>
            <path d="M32 52c8 4 12 4 18 0" />
            <path d="M34 58c8 4 14 4 20 0" />
            <path d="M40 65c6 3 10 3 14 0" />
          </g>
        )}
        {(coat === "calico" || coat === "tortie") && (
          <g className={styles.patches}>
            <ellipse cx="36" cy="54" rx="8" ry="6" />
            <ellipse cx="62" cy="60" rx="7" ry="5" />
          </g>
        )}
        <g className={styles.paws}>
          <ellipse cx="36" cy="71" rx="6.5" ry="3.6" />
          <ellipse cx="54" cy="72" rx="6.5" ry="3.6" />
        </g>
        <g className={styles.head}>
          <path className={styles.ear} d="M32 40 35 20 46 36Z" />
          <path className={styles.ear} d="M64 36 73 18 78 42Z" />
          <path className={styles.inner} d="M35 36 37 26 43 35Z" />
          <path className={styles.inner} d="M66 35 71 24 74 39Z" />
          <ellipse className={styles.face} cx="54" cy="42" rx="19" ry="16" />
          {(coat === "tuxedo" || coat === "orangeWhite" || coat === "calico" || coat === "point" || coat === "white") && (
            <ellipse className={styles.muzzle} cx="56" cy="47" rx="9" ry="6.5" />
          )}
          <ellipse className={styles.eye} cx="46" cy="41" rx="3" ry="3.4" />
          <ellipse className={styles.eye} cx="62" cy="41" rx="3" ry="3.4" />
          <ellipse className={styles.pupil} cx="46.6" cy="41.4" rx="1.3" ry="1.8" />
          <ellipse className={styles.pupil} cx="62.6" cy="41.4" rx="1.3" ry="1.8" />
          <ellipse className={styles.nose} cx="54" cy="47" rx="2.1" ry="1.5" />
          <path className={styles.mouth} d="M54 48.4c-2.2 2.2-4.2 2-5.4.8M54 48.4c2.2 2.2 4.2 2 5.4.8" />
        </g>
        {action === "shy" && <ellipse className={styles.bush} cx="28" cy="68" rx="16" ry="9" />}
        {action === "eat" && (
          <g>
            <ellipse className={styles.bowl} cx="78" cy="70" rx="9" ry="4.2" />
          </g>
        )}
      </g>
      {action === "meow" && (
        <g className={styles.bubble}>
          <circle cx="80" cy="18" r="11" />
          <text x="80" y="22" textAnchor="middle">喵</text>
        </g>
      )}
      {action === "sleepy" && <text className={styles.zzz} x="72" y="24">z z</text>}
      {action === "clingy" && <path className={styles.heart} d="M74 28c0-3.2 4.2-5.2 4.2-1.2 0-4 4.2-2 4.2 1.2 0 4.2-4.2 7.2-4.2 7.2S74 32.2 74 28z" />}
    </svg>
  );
}
