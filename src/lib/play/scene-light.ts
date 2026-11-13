// 虛擬飼養：白天／夜晚兩種光（#354，docs/play-tasks/5-場景與技術.md）。純函式，數值集中在這裡，改光只改這個檔。
// 劇本的 scene.time 有 day／dusk／night 三種，但只做兩種光：傍晚歸白天，待渝茜確認。
// 兩種 3D 房間吃同一組設定：
//   - 示範娃娃屋（FloorplanViewer）：一般 three.js 燈光，直接換顏色與強度；夜晚在貓身上多一盞小補光（貓要看得清楚）。
//   - 掃描房間（RoomViewer）：Gaussian Splat 不吃燈光，只能整體調色。夜晚在畫布上疊一層半透明深藍（veil），
//     中間挖一個跟著貓走的洞（貓所在區域減弱夜色）；虛擬物件的半球光同時調暗、調藍，才不會和背景脫節。
//     不加後製 pass、不加陰影、不多渲染一次：veil 只是一個 HTML 元素，跟著貓移動只改 transform（合成層，不重畫）。
import type { CatPose } from "./story";

export type LightTime = "day" | "night";

/** 劇本的時間 → 兩種光。傍晚歸白天（待渝茜確認）；不認得的一律白天 */
export const lightTime = (time: string | null | undefined): LightTime => (time === "night" ? "night" : "day");

/** 遊戲現在該用哪種光：只有劇情節點裡的夜晚場景是夜晚；開場、採買、擺用品、在家的時光、報告都是白天（和 bgmFor 的日常一致） */
export function playLightTime({ step, time, home }: { step: string; time: string; home: boolean }): LightTime {
  if (step !== "node" || home) return "day";
  return lightTime(time);
}

export interface SceneLight {
  time: LightTime;
  /** 示範娃娃屋（FloorplanViewer） */
  house: {
    background: string;
    hemi: { sky: string; ground: string; intensity: number };
    ambient: number;
    sun: { color: string; intensity: number };
    /** 貓身上的小補光（點光源）強度；0＝不亮 */
    catLight: number;
    catLightColor: string;
  };
  /** 掃描房間（RoomViewer） */
  scan: {
    /** 虛擬物件（貓、用品）的半球光 */
    hemi: { sky: number; ground: number; intensity: number };
    /** 疊在畫布上的夜色：顏色（r, g, b）與不透明度；0＝不疊 */
    veil: { rgb: readonly [number, number, number]; alpha: number };
  };
}

// 白天＝兩個元件原本的燈光（FloorplanViewer、RoomViewer 不傳 light 時的預設值），白天傳進去畫面不變
const DAY: SceneLight = {
  time: "day",
  house: {
    background: "#F3EFE7",
    hemi: { sky: "#fffaf2", ground: "#d8ccb8", intensity: 1.7 },
    ambient: 0.35,
    sun: { color: "#fff6e8", intensity: 2.2 },
    catLight: 0,
    catLightColor: "#ffe9c9",
  },
  scan: { hemi: { sky: 0xffffff, ground: 0x808080, intensity: 1.6 }, veil: { rgb: [18, 26, 58], alpha: 0 } },
};

// 夜晚：整體暗、偏藍（月光）；貓身上一盞暖色小補光，貓不會跟著背景一起糊掉
const NIGHT: SceneLight = {
  time: "night",
  house: {
    background: "#1d2438",
    hemi: { sky: "#9fb0e0", ground: "#2b3044", intensity: 0.55 },
    ambient: 0.12,
    sun: { color: "#a9bcf0", intensity: 0.6 },
    catLight: 2.4,
    catLightColor: "#ffe9c9",
  },
  scan: { hemi: { sky: 0xb4c4ff, ground: 0x404a6a, intensity: 1.25 }, veil: { rgb: [18, 26, 58], alpha: 0.58 } },
};

export const lightFor = (time: string | null | undefined): SceneLight => (lightTime(time) === "night" ? NIGHT : DAY);

/** 半夜跑酷（姿勢 zoom）時貓的速度倍率：母體還沒有奔跑動作（run 只有奔跑貓母體有），先把走路動作加速代替 */
export const ZOOM_SPEED = 2.2;
export const poseSpeed = (pose: CatPose, base: number) => (pose === "zoom" ? base * ZOOM_SPEED : base);

/** 掃描房間夜色挖洞的位置：貓頭在畫面的比例座標（0～1，左上為 0）→ veil 元素的 translate（%）。
 *  veil 是宿主 3 倍大的元素、洞在正中間，所以 translate＝(比例 ÷ 3 − 0.5) × 100%；
 *  比例夾在 −0.5～1.5，洞跑到畫面外時 veil 仍蓋滿整個畫面。 */
export function veilShift(fx: number, fy: number): [number, number] {
  const c = (v: number) => Math.min(1.5, Math.max(-0.5, v));
  return [(c(fx) / 3 - 0.5) * 100, (c(fy) / 3 - 0.5) * 100];
}
