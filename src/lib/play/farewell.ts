// 虛擬飼養：結局畫面（#354，節點 farewell）。純函式：現在該不該疊結局插圖、是哪一幕。
// bed＝老貓在窗邊陽光裡睡著；gone＝貓離開那一幕，陽光慢慢淡成星空與貓掌印。frail（走到門口）那一幕還是 3D 房間。
import type { CatPose } from "./story";

export type FarewellPhase = "sleep" | "gone";

export function farewellPhase({ step, nodeId, pose }: { step: string; nodeId: string | null; pose: CatPose }): FarewellPhase | null {
  if (step !== "node" || nodeId !== "farewell") return null;
  return pose === "bed" ? "sleep" : pose === "none" ? "gone" : null;
}
