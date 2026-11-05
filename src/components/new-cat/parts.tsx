"use client";
// 新增送養貓用的小元件（#206）：單選、複選、標籤、貓咪圖。選項框一樣大小（設計稿「可點的小框」）
import type { ReactNode } from "react";
import s from "./newcat.module.css";

/** 單選：再點一次同一個就取消 */
export function Seg<T extends string | number>({ label, options, value, onChange, cols }: {
  label: string; options: readonly (readonly [T, string])[]; value: T | null | undefined; onChange: (v: T | null) => void; cols?: number;
}) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map(([k, l]) => (
        <button key={String(k)} type="button" role="radio" aria-checked={value === k} className={s.opt} onClick={() => onChange(value === k ? null : k)}>{l}</button>
      ))}
    </div>
  );
}

/** 複選 */
export function Toggles({ label, options, value, onChange }: {
  label: string; options: readonly string[]; value: readonly string[]; onChange: (v: string[]) => void;
}) {
  return (
    <div className={s.chips} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o} type="button" className={s.chip} aria-pressed={value.includes(o)}
          onClick={() => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])}>{o}</button>
      ))}
    </div>
  );
}

/** 「你說的」「照片預測」：AI 自動填的欄位，提醒中途再檢查 */
export function Said({ k, said, guessed }: { k: string; said: readonly string[]; guessed: readonly string[] }) {
  if (said.includes(k)) return <span className={s.badge}>你說的</span>;
  if (guessed.includes(k)) return <span className={`${s.badge} ${s.badgeGuess}`}>照片預測</span>;
  return null;
}

export const EditIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M14 8l3 3" />
  </svg>
);

export function Field({ label, htmlFor, children, tag }: { label: ReactNode; htmlFor?: string; children: ReactNode; tag?: ReactNode }) {
  return (
    <div className={s.field}>
      {htmlFor ? <label className={s.label} htmlFor={htmlFor}>{label}{tag}</label> : <span className={s.label}>{label}{tag}</span>}
      {children}
    </div>
  );
}

// ---------- 貓咪圖（照設計稿） ----------
const SIDE_TAIL = "M300 158C330 140 338 96 322 58C316 44 330 34 338 46";
const SIDE = (
  <>
    <ellipse cx="212" cy="176" rx="96" ry="46" /><ellipse cx="142" cy="172" rx="40" ry="50" /><ellipse cx="282" cy="180" rx="40" ry="46" />
    <rect x="120" y="180" width="24" height="98" rx="12" /><rect x="156" y="186" width="24" height="92" rx="12" /><rect x="258" y="190" width="24" height="88" rx="12" /><rect x="290" y="184" width="24" height="94" rx="12" />
    <path d="M46 92L40 30Q42 18 54 26L96 62Z" /><path d="M106 58L144 22Q154 16 156 28L160 96Z" /><ellipse cx="100" cy="110" rx="66" ry="56" />
  </>
);
const FRONT_TAIL = "M234 236C282 226 292 166 264 136";
const FRONT = (
  <>
    <ellipse cx="175" cy="202" rx="62" ry="64" />
    <rect x="112" y="214" width="24" height="70" rx="12" /><rect x="214" y="214" width="24" height="70" rx="12" />
    <rect x="140" y="206" width="26" height="80" rx="13" /><rect x="184" y="206" width="26" height="80" rx="13" />
    <path d="M122 80L116 22Q118 10 130 16L170 48Z" /><path d="M180 48L220 16Q232 10 234 22L228 80Z" /><ellipse cx="175" cy="98" rx="66" ry="56" />
  </>
);
const BACK_TAIL = "M175 230C150 200 150 140 184 112";
const BACK = (
  <>
    <ellipse cx="175" cy="202" rx="70" ry="62" />
    <rect x="116" y="214" width="26" height="72" rx="13" /><rect x="208" y="214" width="26" height="72" rx="13" />
    <rect x="142" y="222" width="24" height="64" rx="12" /><rect x="184" y="222" width="24" height="64" rx="12" />
    <path d="M122 80L116 22Q118 10 130 16L170 48Z" /><path d="M180 48L220 16Q232 10 234 22L228 80Z" /><ellipse cx="175" cy="98" rx="64" ry="54" />
  </>
);

/** 拍照格子裡的提示圖：正面、側面、背面的外框 */
export function AngleGuide({ kind }: { kind: "front" | "left" | "back" }) {
  const line = "var(--orange-deep)", bg = "var(--cream)";
  const shapes = kind === "left" ? SIDE : kind === "front" ? FRONT : BACK;
  const tail = kind === "left" ? SIDE_TAIL : kind === "front" ? FRONT_TAIL : BACK_TAIL;
  const tailFront = kind === "back";
  const tIn = <path d={tail} fill="none" stroke={bg} strokeWidth="18" strokeLinecap="round" />;
  return (
    <svg viewBox="0 0 350 284" aria-hidden="true">
      <path d="M10 60V10h50M290 10h50v50M340 224v50h-50M60 274H10v-50" fill="none" stroke="var(--yellow-deep, #e9a21f)" strokeWidth="10" strokeLinecap="round" />
      <g transform={kind === "left" ? "translate(0 -8)" : "translate(0 -12)"}>
        <g stroke={line} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" fill={line}><path d={tail} fill="none" strokeWidth="30" />{shapes}</g>
        <g fill={bg}>{!tailFront && tIn}{shapes}{tailFront && tIn}</g>
        {kind === "front" && <g fill={line}><ellipse cx="150" cy="96" rx="8" ry="10" /><ellipse cx="200" cy="96" rx="8" ry="10" /><path d="M168 118h14l-7 8z" /></g>}
      </g>
    </svg>
  );
}

/** 摸摸牠用的橘虎斑貓（站姿，350×330） */
export function ColorCat() {
  const paws = [134, 170, 272, 304];
  return (
    <svg viewBox="0 0 350 330" aria-hidden="true">
      <ellipse cx="200" cy="300" rx="130" ry="12" fill="#fbf5ea" />
      <g transform="translate(0 6)">
        <g stroke="#7a6252" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round" fill="#7a6252">
          <path d={SIDE_TAIL} fill="none" strokeWidth="30" />{SIDE}
          {paws.map(x => <ellipse key={x} cx={x} cy="280" rx="17" ry="9" />)}
        </g>
        <g fill="#fde3c6">
          <path d={SIDE_TAIL} fill="none" stroke="#fde3c6" strokeWidth="20" strokeLinecap="round" />{SIDE}
          {paws.map(x => <ellipse key={x} cx={x} cy="280" rx="17" ry="9" fill="#fffaf0" />)}
        </g>
        <path d="M55 80L52 42L82 64Z" fill="#f4b2ad" /><path d="M118 60L144 36L150 84Z" fill="#f4b2ad" />
        <g fill="none" stroke="#e8913a" strokeWidth="6" strokeLinecap="round">
          <path d="M86 62q5 11 0 22M100 58v26M114 62q-5 11 0 22" />
          <path d="M196 133q7 14 0 28M222 131q7 15 0 30M248 133q7 14 0 28M274 140q6 12 0 24" />
          <path d="M318 112l14-4M322 86l14-2" />
        </g>
        <ellipse cx="100" cy="140" rx="36" ry="22" fill="#fffaf0" />
        <ellipse cx="138" cy="190" rx="22" ry="34" fill="#fffaf0" />
        <ellipse cx="74" cy="102" rx="8" ry="10" fill="#3f2e24" /><ellipse cx="126" cy="102" rx="8" ry="10" fill="#3f2e24" />
        <circle cx="76" cy="98" r="3" fill="#fff" /><circle cx="128" cy="98" r="3" fill="#fff" />
        <ellipse cx="62" cy="124" rx="9" ry="5" fill="#f4b2ad" /><ellipse cx="138" cy="124" rx="9" ry="5" fill="#f4b2ad" />
        <path d="M93 124h14l-7 8z" fill="#f4b2ad" stroke="#7a6252" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 132q-5 8-12 4M100 132q5 8 12 4" fill="none" stroke="#7a6252" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M66 134l-30-4M66 141l-28 5M134 134l30-4M134 141l28 5" stroke="#7a6252" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export const MicIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" />
  </svg>
);
export const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
);
export const PlusIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
