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
}

type Shot = Omit<CameraShot, "key">;

const SHOTS: Partial<Record<NodeId, Partial<Record<CatPose, Shot>>>> = {
  // 貓鑽進外出籠：靠近、壓低，看得到籠口
  day1: { carrier: { id: "carrier", dist: 1.0, height: 0.25, ms: 1400, delayMs: 1500 } },
  // 半夜跑酷：拉遠、拉高，整段衝刺都在畫面裡
  day30: { zoom: { id: "zoom", dist: 2.4, height: 1.1, ms: 1200, delayMs: 300 } },
  // 結尾：先中景，最後一幕（睡著）很慢地推近
  farewell: {
    frail: { id: "farewell", dist: 1.6, height: 0.6, ms: 2400, delayMs: 800 },
    bed: { id: "farewell-bed", dist: 0.9, height: 0.35, ms: 4500, delayMs: 600 },
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
