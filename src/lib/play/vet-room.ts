// 虛擬飼養：診間（#354，docs/play-tasks/5-場景與技術.md）。節點 4、5、6 看獸醫（scene.bg＝vet）時，舞台換成這個小診間。
// 純資料＋純函式：零件清單、顏色、診療台高度都在這裡，元件（components/play/VetRoom.tsx）只負責畫。
// 座標：公尺，原點＝地板中央，x 右、y 上、z 朝鏡頭。低多邊形、不開陰影，手機才跑得動（掃描房間已經吃重）。
import type { SceneLight } from "./scene-light";

/** 診間色票：3D 材質要實際色值，這裡對應 globals.css 的 v2 token（改色先改 token，再同步這裡） */
export const VET_COLORS = {
  paper: "#fbf5ea",      // --paper：牆
  cream: "#fffaf0",      // --cream：天花板邊、櫃門
  line: "#efe3cf",       // --line：地板、踢腳
  yellowSoft: "#fdedc4", // --yellow-soft：牆下半段
  yellow: "#f6b53b",     // --yellow：燈、小物
  caramel: "#a5602a",    // --caramel：櫃子木頭
  mintSoft: "#e3f2e7",   // --mint-soft：診療台墊
  pink: "#f4b2ad",       // --pink：小物
  card: "#ffffff",       // --card：診療台金屬面、海報
  inkSoft: "#7a6252",    // --ink-soft：台腳、把手、獸醫頭髮與聽診器
  ink: "#3f2e24",        // --ink：獸醫眼睛、眼鏡、嘴巴
  orange: "#e8913a",     // --orange：獸醫白袍裡的上衣（同對話框頭像的身體色）
  orangeSoft: "#fde3c6", // --orange-soft：獸醫的臉和手（同對話框頭像的臉色）
} as const;

export type VetColor = (typeof VET_COLORS)[keyof typeof VET_COLORS];

export interface VetPart {
  id: string;
  shape: "box" | "cyl";
  /** box：寬、高、深；cyl：直徑、高、直徑 */
  size: readonly [number, number, number];
  /** 中心點 */
  pos: readonly [number, number, number];
  color: VetColor;
}

const C = VET_COLORS;
const TABLE_H = 0.8;

/** 診間零件（約 20 個 mesh）：地板、兩面牆、診療台、櫃子、體重計、小物 */
export const VET_PARTS: readonly VetPart[] = [
  { id: "floor", shape: "box", size: [4, 0.04, 3.2], pos: [0, -0.02, 0], color: C.line },
  { id: "wall-back", shape: "box", size: [4, 2.6, 0.06], pos: [0, 1.3, -1.6], color: C.paper },
  { id: "wall-back-low", shape: "box", size: [4, 0.9, 0.02], pos: [0, 0.45, -1.56], color: C.yellowSoft },
  { id: "wall-left", shape: "box", size: [0.06, 2.6, 3.2], pos: [-2, 1.3, 0], color: C.paper },
  { id: "wall-left-low", shape: "box", size: [0.02, 0.9, 3.2], pos: [-1.96, 0.45, 0], color: C.yellowSoft },
  // 診療台：圓台腳＋金屬台面＋薄墊（貓坐在墊上）
  { id: "table-leg", shape: "cyl", size: [0.16, TABLE_H - 0.06, 0.16], pos: [0.1, (TABLE_H - 0.06) / 2, -0.2], color: C.inkSoft },
  { id: "table-foot", shape: "cyl", size: [0.5, 0.04, 0.5], pos: [0.1, 0.02, -0.2], color: C.inkSoft },
  { id: "table-base", shape: "box", size: [1.1, 0.04, 0.6], pos: [0.1, TABLE_H - 0.04, -0.2], color: C.card },
  { id: "table-top", shape: "box", size: [0.9, 0.02, 0.5], pos: [0.1, TABLE_H - 0.01, -0.2], color: C.mintSoft },
  // 靠牆的櫃子：木頭櫃身＋兩片門＋把手，上面放藥罐
  { id: "cab", shape: "box", size: [1.0, 0.9, 0.45], pos: [-1.35, 0.45, -1.3], color: C.caramel },
  { id: "cab-door-l", shape: "box", size: [0.46, 0.78, 0.02], pos: [-1.6, 0.47, -1.06], color: C.cream },
  { id: "cab-door-r", shape: "box", size: [0.46, 0.78, 0.02], pos: [-1.1, 0.47, -1.06], color: C.cream },
  { id: "cab-knob-l", shape: "cyl", size: [0.04, 0.03, 0.04], pos: [-1.4, 0.55, -1.04], color: C.inkSoft },
  { id: "cab-knob-r", shape: "cyl", size: [0.04, 0.03, 0.04], pos: [-1.3, 0.55, -1.04], color: C.inkSoft },
  { id: "jar-1", shape: "cyl", size: [0.14, 0.2, 0.14], pos: [-1.65, 1.0, -1.35], color: C.pink },
  { id: "jar-2", shape: "cyl", size: [0.12, 0.16, 0.12], pos: [-1.45, 0.98, -1.3], color: C.yellow },
  { id: "jar-3", shape: "cyl", size: [0.1, 0.24, 0.1], pos: [-1.1, 1.02, -1.35], color: C.card },
  // 牆上：一張圓角海報（貓體態表）＋吊燈
  { id: "poster", shape: "box", size: [0.7, 0.9, 0.02], pos: [0.9, 1.55, -1.55], color: C.card },
  { id: "poster-band", shape: "box", size: [0.56, 0.12, 0.01], pos: [0.9, 1.78, -1.535], color: C.yellow },
  { id: "lamp-cord", shape: "cyl", size: [0.02, 0.7, 0.02], pos: [0.1, 2.25, -0.2], color: C.inkSoft },
  { id: "lamp", shape: "cyl", size: [0.44, 0.14, 0.44], pos: [0.1, 1.85, -0.2], color: C.yellow },
  // 地上的體重計
  { id: "scale", shape: "box", size: [0.5, 0.06, 0.4], pos: [1.3, 0.03, 0.3], color: C.card },
];

/** 貓站的位置：診療台墊子頂端中央 */
export const TABLE_TOP = { x: 0.1, y: TABLE_H, z: -0.2 } as const;

/** 現在要不要顯示診間：只有劇情節點裡、bg＝vet；在家的時光一律回自己家 */
export function showVet({ step, bg, home }: { step: string; bg: string; home: boolean }): boolean {
  return step === "node" && bg === "vet" && !home;
}

/** 診間的燈：直接吃白天／夜晚（lightFor(time).house）；沒傳＝白天。診間不需要背景色（牆蓋滿畫面） */
export type VetLight = Pick<SceneLight["house"], "hemi" | "ambient" | "sun" | "catLight" | "catLightColor">;
const DAY_VET: VetLight = {
  hemi: { sky: "#fffaf2", ground: "#d8ccb8", intensity: 1.7 }, ambient: 0.35, sun: { color: "#fff6e8", intensity: 2.2 }, catLight: 0, catLightColor: "#ffe9c9",
};
export function vetLight(house: SceneLight["house"] | null | undefined): VetLight {
  if (!house) return DAY_VET;
  const { hemi, ambient, sun, catLight, catLightColor } = house;
  return { hemi, ambient, sun, catLight, catLightColor };
}

// ── 獸醫（#354，渝茜 2026-11-14）：程式建的低多邊形 Q 版人物，造型對齊對話框頭像（SpeakerAvatar 的 vet）：
//    圓臉（orange-soft）、深色頭髮（ink-soft）、圓眼鏡、白袍、聽診器。不用照片、不寫實；24 個 mesh。
//    座標：腳底為原點、正前方 local +z；on＝head 的零件以「脖子頂端」為原點，點頭時一起轉。

export interface DoctorPart {
  id: string;
  /** box：寬高深；cyl：上半徑、下半徑、高；sphere：半徑；cap：上半球半徑；torus：半徑、管粗、弧度 */
  shape: "box" | "cyl" | "sphere" | "cap" | "torus";
  args: readonly number[];
  pos: readonly [number, number, number];
  rot?: readonly [number, number, number];
  color: VetColor;
  on: "body" | "head";
}

/** 脖子頂端（點頭的轉軸）離地高度 */
export const DOCTOR_NECK_Y = 1.3;
const HALF = Math.PI;

export const DOCTOR_PARTS: readonly DoctorPart[] = [
  // 身體：腿、白袍（下寬上窄）、圓肩、袍裡的橘色上衣、手臂、手
  { id: "leg-l", shape: "cyl", args: [0.06, 0.06, 0.62], pos: [-0.08, 0.31, 0], color: C.inkSoft, on: "body" },
  { id: "leg-r", shape: "cyl", args: [0.06, 0.06, 0.62], pos: [0.08, 0.31, 0], color: C.inkSoft, on: "body" },
  { id: "coat", shape: "cyl", args: [0.17, 0.25, 0.62], pos: [0, 0.88, 0], color: C.card, on: "body" },
  { id: "shoulders", shape: "sphere", args: [0.17], pos: [0, 1.19, 0], color: C.card, on: "body" },
  { id: "shirt", shape: "box", args: [0.09, 0.1, 0.01], pos: [0, 1.15, 0.19], rot: [-0.2, 0, 0], color: C.orange, on: "body" },
  { id: "arm-l", shape: "cyl", args: [0.055, 0.065, 0.48], pos: [-0.22, 0.96, 0.02], rot: [0, 0, -0.12], color: C.card, on: "body" },
  { id: "arm-r", shape: "cyl", args: [0.055, 0.065, 0.48], pos: [0.22, 0.96, 0.02], rot: [0, 0, 0.12], color: C.card, on: "body" },
  { id: "hand-l", shape: "sphere", args: [0.055], pos: [-0.25, 0.7, 0.03], color: C.orangeSoft, on: "body" },
  { id: "hand-r", shape: "sphere", args: [0.055], pos: [0.25, 0.7, 0.03], color: C.orangeSoft, on: "body" },
  { id: "neck", shape: "cyl", args: [0.06, 0.06, 0.1], pos: [0, 1.27, 0], color: C.orangeSoft, on: "body" },
  // 聽診器：掛在脖子上的弧＋垂下的管子＋聽頭
  { id: "steth", shape: "torus", args: [0.12, 0.012, HALF], pos: [0, 1.24, 0.1], rot: [-0.5, 0, HALF], color: C.inkSoft, on: "body" },
  { id: "steth-tube", shape: "cyl", args: [0.012, 0.012, 0.14], pos: [0.12, 1.15, 0.17], color: C.inkSoft, on: "body" },
  { id: "steth-head", shape: "cyl", args: [0.032, 0.032, 0.016], pos: [0.12, 1.07, 0.2], rot: [HALF / 2, 0, 0], color: C.yellow, on: "body" },
  { id: "badge", shape: "box", args: [0.07, 0.04, 0.01], pos: [-0.1, 1.06, 0.2], rot: [-0.13, 0, 0], color: C.pink, on: "body" },
  // 頭（以脖子頂端為原點）：大圓臉、往後傾的頭髮帽、眼睛、圓眼鏡、微笑、腮紅
  { id: "head", shape: "sphere", args: [0.19], pos: [0, 0.18, 0], color: C.orangeSoft, on: "head" },
  { id: "hair", shape: "cap", args: [0.2], pos: [0, 0.2, -0.015], rot: [-0.45, 0, 0], color: C.inkSoft, on: "head" },
  { id: "eye-l", shape: "sphere", args: [0.02], pos: [-0.065, 0.19, 0.172], color: C.ink, on: "head" },
  { id: "eye-r", shape: "sphere", args: [0.02], pos: [0.065, 0.19, 0.172], color: C.ink, on: "head" },
  { id: "glass-l", shape: "torus", args: [0.045, 0.007, HALF * 2], pos: [-0.065, 0.19, 0.185], color: C.ink, on: "head" },
  { id: "glass-r", shape: "torus", args: [0.045, 0.007, HALF * 2], pos: [0.065, 0.19, 0.185], color: C.ink, on: "head" },
  { id: "bridge", shape: "box", args: [0.04, 0.008, 0.008], pos: [0, 0.195, 0.19], color: C.ink, on: "head" },
  { id: "smile", shape: "torus", args: [0.03, 0.007, HALF], pos: [0, 0.125, 0.178], rot: [0, 0, HALF], color: C.ink, on: "head" },
  { id: "cheek-l", shape: "sphere", args: [0.025], pos: [-0.115, 0.13, 0.145], color: C.pink, on: "head" },
  { id: "cheek-r", shape: "sphere", args: [0.025], pos: [0.115, 0.13, 0.145], color: C.pink, on: "head" },
];

/** 獸醫站在診療台後側、面向貓（鏡頭從右前方看得到臉）；yaw＝讓 local +z 指向貓 */
const DOC_X = 0.5, DOC_Z = -0.78;
export const DOCTOR_AT = { pos: [DOC_X, 0, DOC_Z] as const, yaw: Math.atan2(TABLE_TOP.x - DOC_X, TABLE_TOP.z - DOC_Z) };

/** 平常的頭：微微低頭看診療台上的貓 */
const BASE_PITCH = 0.18;
export interface DoctorPose { breathe: number; headPitch: number; headYaw: number }

/**
 * 獸醫的待機姿勢（純函式，元件每幀呼叫）。t＝秒；nodAge＝獸醫開口後過了幾秒（null＝沒在說話）；still＝減少動態（完全不動）。
 * 呼吸：身體 y 縮放 ±1.2%；偶爾轉頭看貓（左右 0.12 弧度）、每 8 秒輕輕點一下頭；說話時點兩下頭（0.9 秒）。
 */
export function doctorPose(t: number, nodAge: number | null, still: boolean): DoctorPose {
  if (still) return { breathe: 1, headPitch: BASE_PITCH, headYaw: 0 };
  const breathe = 1 + 0.012 * Math.sin((2 * Math.PI * t) / 3.6);
  const phase = ((t % 8) + 8) % 8;
  const idleNod = phase < 0.8 ? 0.08 * Math.sin((Math.PI * phase) / 0.8) : 0;
  const talkNod = nodAge !== null && nodAge >= 0 && nodAge < 0.9 ? 0.22 * Math.abs(Math.sin((Math.PI * nodAge) / 0.45)) : 0;
  return { breathe, headPitch: BASE_PITCH + Math.max(idleNod, talkNod), headYaw: talkNod ? 0 : 0.12 * Math.sin((2 * Math.PI * t) / 9) };
}

/** 現在的劇情卡片是不是獸醫在說話：是就回一個這張卡專屬的 key（換卡才再點頭），不是回 null */
export function vetTalkKey(cur: { kind: string; who?: string; t?: string; lines?: readonly { who?: string; t: string }[] } | null | undefined): string | null {
  if (!cur) return null;
  if (cur.kind === "ask") return cur.who === "vet" ? `ask:${cur.t ?? ""}` : null;
  if (cur.kind === "lines") {
    const said = (cur.lines ?? []).filter(l => l.who === "vet").map(l => l.t);
    return said.length ? `lines:${said.join("|")}` : null;
  }
  return null;
}
