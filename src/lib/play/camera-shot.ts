// 虛擬飼養：劇情鏡頭（#354，docs/play-tasks/5-場景與技術.md）。重要時刻鏡頭該看哪裡、離多遠、要不要慢慢推近。
// 純函式：RoomViewer（掃描房間）、FloorplanViewer（示範娃娃屋）都照這份提示做，只是換算成各自的座標。
// 只管三個時刻：第 1 天貓躲進外出籠、第 30 天半夜跑酷、結尾。其他時刻回 null＝維持原本的鏡頭（含擺用品的俯視鏡頭）。
import type { CatPose, NodeId } from "./story";

export interface CameraShot {
  /** 同一個 key 不重播（節點＋姿勢） */
  key: string;
  id: "carrier" | "zoom" | "farewell" | "farewell-bed";
  /** 鏡頭離貓頭幾公尺（水平） */
  dist: number;
  /** 鏡頭比貓頭高幾公尺 */
  height: number;
  /** 鏡頭移過去花多久（毫秒）；越久越像「慢慢推近」 */
  ms: number;
  /** 等多久再取景（毫秒）：讓貓先走到定位（例如走到外出籠旁） */
  delayMs: number;
  /** 改用俯瞰整個房間（擺用品那套俯視鏡頭；dist、height 不用）。這一幕結束後鏡頭飛回原本的位置 */
  overview?: boolean;
}

type Shot = Omit<CameraShot, "key">;

const SHOTS: Partial<Record<NodeId, Partial<Record<CatPose, Shot>>>> = {
  // 貓鑽進外出籠：看得到籠口，也看得到周圍（渝茜 2026-11-14：原本 1.9／0.7 太貼地板）
  day1: { carrier: { id: "carrier", dist: 2.5, height: 1.0, ms: 1400, delayMs: 1500 } },
  // 半夜跑酷：俯瞰整個房間，貓跑到哪都看得到（渝茜 2026-11-14）；dist、height 是沒有房間範圍時的備用
  day30: { zoom: { id: "zoom", dist: 3.0, height: 1.3, ms: 1200, delayMs: 300, overview: true } },
  // 結尾：拉近看牠躺著（渝茜 2026-11-16：貓快走了，要配合劇情；原本 1.6／0.6、1.4／0.55 太遠），最後一幕（睡著）很慢地再推近
  farewell: {
    frail: { id: "farewell", dist: 1.0, height: 0.45, ms: 2400, delayMs: 800 },
    bed: { id: "farewell-bed", dist: 0.75, height: 0.38, ms: 4500, delayMs: 600 },
  },
};

/** 節點＋劇情姿勢 → 鏡頭提示；沒有＝null（不動鏡頭） */
export function shotFor(nodeId: string, pose: CatPose): CameraShot | null {
  const s = SHOTS[nodeId as NodeId]?.[pose];
  return s ? { key: `${nodeId}:${pose}`, ...s } : null;
}

/** 依畫面寬高比調整距離：手機直式畫面水平視角窄，同樣距離貓會塞滿畫面，所以退遠（最多 2.2 倍）；橫式不變 */
export function shotReach(shot: Pick<CameraShot, "dist" | "height">, aspect: number): { dist: number; height: number } {
  const k = Math.min(2.2, Math.max(1, 0.9 / Math.max(0.1, aspect)));
  return { dist: shot.dist * k, height: shot.height * k };
}

/**
 * 瞄準點要往下壓多少（和 dist 同單位），貓才會落在劇情卡上面空白處的中間、不被卡片蓋住（渝茜 2026-11-16：結尾的貓被卡片擋住）。
 * dist＝鏡頭到貓頭的距離、fovDeg＝垂直視角、inset＝卡片蓋住畫面下方的比例（0～1）。
 * 沒蓋住的範圍是 NDC -1+2×inset～1，中間在 inset；鏡頭對準貓頭下方 drop 處，貓頭就在那裡。
 */
export const shotAimDrop = (dist: number, fovDeg: number, inset: number) =>
  inset <= 0 ? 0 : dist * Math.tan((fovDeg * Math.PI) / 360) * inset;
