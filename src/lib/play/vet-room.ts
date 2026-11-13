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
  inkSoft: "#7a6252",    // --ink-soft：台腳、把手
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
