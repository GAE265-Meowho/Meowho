// 跳躍動作片段的前處理（掃描房間 RoomCat、示範娃娃屋 CatModel 共用）：
// 跳躍動作（jump_a/b/c）的根骨頭帶著位移（往上 0.3～0.7 模型單位），程式自己算拋物線時會跳兩倍高，所以拿掉位移只留姿勢；
// 拿掉之前先從那條曲線讀出離地、落地的時間（cat-moves.ts 的 jumpTiming），讓程式的拋物線對上動作。
import * as THREE from "three";
import { jumpTiming, type JumpTiming } from "./cat-moves";

/** 會上下動的根骨頭位移軌（.position 軌裡 y 起伏最大、超過 1 公分的那條） */
function rootTrack(clip: THREE.AnimationClip): { track: THREE.KeyframeTrack; ys: number[] } | null {
  let best: { track: THREE.KeyframeTrack; ys: number[] } | null = null, range = 0.01;
  for (const track of clip.tracks) {
    if (!track.name.endsWith(".position") || track.getValueSize() !== 3) continue;
    const ys = Array.from({ length: track.times.length }, (_, i) => track.values[i * 3 + 1]);
    const r = Math.max(...ys) - Math.min(...ys);
    if (r > range) { range = r; best = { track, ys }; }
  }
  return best;
}

export const isJumpClip = (name: string) => name.startsWith("jump");

/** 跳躍動作的離地、落地時間；讀不到回 null（呼叫端用預設值） */
export function clipJumpTiming(clip: THREE.AnimationClip): JumpTiming | null {
  const root = rootTrack(clip);
  return root ? jumpTiming(Array.from(root.track.times), root.ys) : null;
}

/** 拿掉根骨頭位移的複本（原地跳的姿勢）；沒有位移就回傳原本的 */
export function inPlaceClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const root = rootTrack(clip);
  if (!root) return clip;
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter(t => t.name !== root.track.name);
  return copy;
}
