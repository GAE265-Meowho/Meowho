"use client";
// 虛擬飼養：結局插圖（#354，節點 farewell）。疊在 3D 房間上面、對話框後面。
//   sleep：老貓（毛色變淡、比較瘦）在窗邊的陽光裡睡著；gone：陽光與貓慢慢淡出，變成星空與一個貓掌印。
// 純 SVG＋CSS，不寫實、不悲傷過度；prefers-reduced-motion 時不做淡入淡出與閃爍，直接顯示該幕的樣子。
import type { FarewellPhase } from "@/lib/play/farewell";
import f from "./farewell.module.css";

const STARS: readonly [number, number, number][] = [
  [60, 40, 2.2], [110, 90, 1.6], [150, 30, 1.8], [250, 24, 2], [300, 70, 2.4], [340, 130, 1.6], [70, 150, 1.8],
  [330, 40, 1.5], [95, 215, 1.6], [305, 205, 2], [215, 60, 1.4], [40, 95, 1.4],
];

export function FarewellScene({ phase }: { phase: FarewellPhase }) {
  return (
    <div className={f.scene} data-phase={phase} role="img" aria-label={phase === "sleep" ? "老貓在窗邊的陽光裡睡著" : "星空裡的一個貓掌印"}>
      <div className={f.night} />
      <svg className={f.art} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g className={f.day}>
          {/* 窗與陽光 */}
          <rect x="130" y="14" width="140" height="130" rx="10" fill="var(--cream, #fffaf0)" stroke="var(--caramel, #a5602a)" strokeWidth="5" />
          <path d="M200 14v130M130 79h140" stroke="var(--caramel, #a5602a)" strokeWidth="4" />
          <path d="M138 22h54v50h-54z" fill="var(--yellow-soft, #fdedc4)" />
          <path d="M208 22h54v50h-54z" fill="var(--yellow-soft, #fdedc4)" />
          <path d="M150 144 L250 144 L330 262 L90 262 Z" fill="var(--yellow, #f6b53b)" opacity="0.22" />
          <rect x="20" y="262" width="360" height="10" rx="5" fill="var(--line, #efe3cf)" />
          {/* 軟墊 */}
          <ellipse cx="200" cy="254" rx="104" ry="22" fill="var(--pink, #f4b2ad)" />
          <ellipse cx="200" cy="248" rx="96" ry="17" fill="var(--pink-soft, #fde7e4)" />
          {/* 老貓：毛色變淡、比較瘦，捲著身體閉眼睡 */}
          <g className={f.cat}>
            <path d="M268 244c26-2 34-26 14-34" fill="none" stroke="var(--coat-silver, #d9d4cc)" strokeWidth="9" strokeLinecap="round" />
            <ellipse cx="206" cy="230" rx="68" ry="26" fill="var(--coat-silver, #d9d4cc)" />
            <path d="M160 218c12-8 24-10 38-10M184 212c14-6 30-6 44-2" fill="none" stroke="var(--coat-silver-deep, #8d8882)" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
            <ellipse cx="146" cy="232" rx="30" ry="22" fill="var(--coat-silver, #d9d4cc)" />
            <path d="M126 216l4-18 14 10zM158 212l10-16 6 18z" fill="var(--coat-silver, #d9d4cc)" />
            <path d="M133 232q6 5 12 0M151 232q6 5 12 0" fill="none" stroke="var(--ink, #3f2e24)" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M144 241q3 2 6 0" fill="none" stroke="var(--ink-soft, #7a6252)" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>
        <g className={f.sky}>
          <path d="M72 70a26 26 0 1 0 30 34a21 21 0 1 1-30-34z" fill="var(--yellow-soft, #fdedc4)" />
          {STARS.map(([x, y, r], i) => (
            <circle key={i} className={f.star} style={{ animationDelay: `${(i % 6) * 0.5}s` }} cx={x} cy={y} r={r} fill="var(--yellow-soft, #fdedc4)" />
          ))}
          {/* 貓掌印 */}
          <g className={f.paw} fill="var(--yellow, #f6b53b)">
            <ellipse cx="200" cy="190" rx="26" ry="21" />
            <ellipse cx="160" cy="154" rx="11" ry="15" transform="rotate(-24 160 154)" />
            <ellipse cx="186" cy="136" rx="11" ry="16" transform="rotate(-8 186 136)" />
            <ellipse cx="214" cy="136" rx="11" ry="16" transform="rotate(8 214 136)" />
            <ellipse cx="240" cy="154" rx="11" ry="15" transform="rotate(24 240 154)" />
          </g>
        </g>
      </svg>
    </div>
  );
}
