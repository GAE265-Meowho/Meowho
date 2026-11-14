// 虛擬飼養劇情對話框（#354）：說話的人的圓形頭像與小圖示。全部是手畫的簡單 SVG（不用 emoji、不用照片），顏色只用 v2 token。
import type { AvatarId, PawState } from "@/lib/play/dialog";

const INK = "var(--ink)";
const line = { fill: "none", stroke: INK, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** 人臉：臉、眼睛、微笑；頭髮與配件由各角色加 */
function Face({ children, hair }: { children?: React.ReactNode; hair: React.ReactNode }) {
  return (
    <>
      <path d="M8 48c1-9 8-13 16-13s15 4 16 13z" fill="var(--orange)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="24" cy="23" r="11" fill="var(--orange-soft)" stroke={INK} strokeWidth="1.8" />
      {hair}
      <circle cx="20" cy="24" r="1.4" fill={INK} /><circle cx="28" cy="24" r="1.4" fill={INK} />
      <path d="M21 28.5c2 1.8 4 1.8 6 0" {...line} />
      {children}
    </>
  );
}

function Animal({ dog }: { dog?: boolean }) {
  return (
    <>
      {dog
        ? <><path d="M12 14c-5 2-6 10-3 15l5-8zM36 14c5 2 6 10 3 15l-5-8z" fill="var(--caramel)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
            <ellipse cx="24" cy="26" rx="12" ry="12" fill="var(--card)" stroke={INK} strokeWidth="1.8" /></>
        : <path d="M10 12l3 9a13 12 0 1 0 22 0l3-9-9 5a14 14 0 0 0-10 0z" fill="var(--yellow)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />}
      <circle cx="19" cy="26" r="1.6" fill={INK} /><circle cx="29" cy="26" r="1.6" fill={INK} />
      <path d="M22.5 30h3l-1.5 1.8zM24 31.8c-1 2-3 2-4 1m4-1c1 2 3 2 4 1" {...line} />
      {!dog && <path d="M9 28h5m-5 4 5-1m25-3h-5m5 4-5-1" {...line} strokeWidth="1.2" />}
    </>
  );
}

const PEOPLE: Record<Exclude<AvatarId, "cat" | "dog">, React.ReactNode> = {
  // 你：短髮
  you: <Face hair={<path d="M13 22c-1-9 5-13 11-13s12 4 11 13c-3-5-8-7-13-6-4 .5-7 3-9 6z" fill="var(--caramel)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />} />,
  // 中途：綁馬尾、圍裙上有愛心
  clerk: <Face hair={<><circle cx="37" cy="17" r="5" fill="var(--caramel-deep)" stroke={INK} strokeWidth="1.8" /><path d="M13 23c-2-9 4-14 11-14s13 5 11 14c-2-5-6-8-11-8s-9 3-11 8z" fill="var(--caramel-deep)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" /></>}>
    <path d="M24 46l-3.5-3.5c-2-2 1-4.5 3.5-2 2.5-2.5 5.5 0 3.5 2z" fill="var(--pink)" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
  </Face>,
  // 獸醫：眼鏡、聽診器
  vet: <Face hair={<path d="M13 21c0-8 5-12 11-12s11 4 11 12c-3-4-7-5-11-5s-8 1-11 5z" fill="var(--ink-soft)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />}>
    <path d="M16.5 24a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0zm8 0a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0zm-1 0h1" {...line} strokeWidth="1.4" />
    <path d="M17 38c0 5 3 7 6 7m8-7v3" {...line} stroke="var(--card)" /><circle cx="31" cy="43" r="2.2" fill="var(--card)" stroke={INK} strokeWidth="1.4" />
  </Face>,
  // 交往的對象：瀏海側分
  partner: <Face hair={<path d="M13 23c-2-8 3-14 11-14 7 0 12 5 11 13-2-3-4-5-7-6-4 4-10 5-15 7z" fill="var(--ink)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />} />,
  // 小孩：兩撮頭髮
  child: <Face hair={<><circle cx="12" cy="15" r="4" fill="var(--caramel)" stroke={INK} strokeWidth="1.8" /><circle cx="36" cy="15" r="4" fill="var(--caramel)" stroke={INK} strokeWidth="1.8" /><path d="M13 21c1-7 5-11 11-11s10 4 11 11c-4-3-7-4-11-4s-7 1-11 4z" fill="var(--caramel)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" /></>} />,
  // 長輩：白頭髮、眼尾皺紋
  elder: <Face hair={<path d="M13 21c0-8 5-12 11-12s11 4 11 12c-2-3-4-4-6-4-2 2-8 2-10 0-2 0-4 1-6 4z" fill="var(--line)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />}>
    <path d="M15 27l2 .800m16-.8-2 .8" {...line} strokeWidth="1.2" />
  </Face>,
  // 其他同住的人
  person: <Face hair={<path d="M13 22c-1-8 4-13 11-13s12 5 11 13c-2-4-6-6-11-6s-9 2-11 6z" fill="var(--ink-soft)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />} />,
};

/** 圓形頭像；純裝飾（名字寫在旁邊的名牌），所以 aria-hidden */
export function SpeakerAvatar({ id, size = 48 }: { id: AvatarId; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" style={{ borderRadius: "50%", flex: "0 0 auto", background: id === "cat" || id === "dog" ? "var(--orange-soft)" : "var(--yellow-soft)", boxShadow: "0 0 0 2px var(--ink)" }}>
      {id === "cat" ? <Animal /> : id === "dog" ? <Animal dog /> : PEOPLE[id]}
    </svg>
  );
}

/** 節點進度的貓掌：走過＝焦糖色、目前＝橘色放大、還沒到＝線條色 */
export function Paw({ state }: { state: PawState }) {
  const size = state === "now" ? 22 : 16;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={state === "now" ? "var(--orange)" : state === "done" ? "var(--caramel)" : "var(--line)"} stroke={state === "todo" ? "var(--ink-soft)" : "var(--ink)"} strokeWidth="1.2" strokeLinejoin="round">
      <path d="M12 12c-4 0-7 3-7 6 0 2 2 3 4 2.5 2-.5 4-.5 6 0 2 .5 4-.5 4-2.5 0-3-3-6-7-6z" />
      <ellipse cx="5" cy="10" rx="2" ry="2.6" /><ellipse cx="9.5" cy="5.5" rx="2" ry="2.8" /><ellipse cx="14.5" cy="5.5" rx="2" ry="2.8" /><ellipse cx="19" cy="10" rx="2" ry="2.6" />
    </svg>
  );
}

export type GlyphId = "good" | "think" | "event" | "note" | "tip" | "health" | "eye";
const GLYPHS: Record<GlyphId, string> = {
  good: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-4 9.5 3 3 5.5-6",
  think: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-2.5 6.500a2.6 2.6 0 1 1 3.7 2.300c-.8.4-1.2 1-1.2 2m0 3h.01",
  event: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.4 9.300l6-.700z",
  note: "M6 3h9l4 4v14H6zm9 0v4h4M9 12h7m-7 4h5",
  tip: "M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.900c.6.5 1 1.2 1 2.100h5c0-.9.4-1.6 1-2.100A6 6 0 0 0 12 3z",
  health: "M9.5 3h5v6.500H21v5h-6.500V21h-5v-6.500H3v-5h6.500z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
};
/** 文字旁的小圖示（做得好、可以再想想、小叮嚀、健康聲明…） */
export function Glyph({ id, size = 20 }: { id: GlyphId; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}>
      <path d={GLYPHS[id]} />
    </svg>
  );
}
