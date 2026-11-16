// 擺用品時貓砂盆和餐碗是不是已經分開放（#354，渝茜 2026-11-14）：第 3 天中途講完要分開放，
// 玩家早就分開放了還被叫去重擺很怪，所以開始飼養時先算好（flow.ts 的 startNodes → life.flags.litterApart）。
// 有位置（娃娃屋、掃描房間自己擺的）看距離；只有「某某旁」的快速位置就看是不是同一個地方。判斷不出來回 false（照舊問）。

/** 兩件中心相距至少幾公尺才算分開（和第 3 天重擺時的門檻一樣） */
export const APART_M = 1.2;

type At = { x: number; z: number } | null | undefined;

export function litterApart(a: { bowl?: At; litter?: At; bowlSpot?: string | null; litterSpot?: string | null; freeSpot?: string }): boolean {
  if (a.bowl && a.litter) return Math.hypot(a.bowl.x - a.litter.x, a.bowl.z - a.litter.z) >= APART_M;
  const free = (v?: string | null) => !v || v === a.freeSpot;
  if (free(a.bowlSpot) || free(a.litterSpot)) return false;
  return a.bowlSpot !== a.litterSpot;
}
