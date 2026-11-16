// 貓自己去磨爪（#354 第 2 份）：無聊時偶爾走到貓抓板旁、面向板子播 scratch（磨爪動作，scripts/clips/scratch.mjs）。純函式。
// 貓抓板是平放在地上的（後台「耐抓劍麻貓抓板」），貓站在板子外面、前腳搭上去扒；掃描房間（cat.js）和娃娃屋（FloorplanViewer）共用。

/** 一次磨幾秒（成貓一爪 0.8 秒，約扒六下） */
export const SCRATCH_SECONDS = 5;
/** 有貓抓板時，無聊去磨爪的機率 */
const SCRATCH_CHANCE = 0.5;

/** 用品名稱是不是貓抓板：遊戲裡叫「貓抓板」，後台品名是「耐抓劍麻貓抓板」 */
export const isScratcher = (name: string) => name.includes("貓抓板");

/** 無聊時做什麼：scratch 去磨爪、bed 跳上床、null 照舊閒晃 */
export function boredChoice(rand: () => number, has: { scratcher: boolean; bed: boolean }): "scratch" | "bed" | null {
  if (has.scratcher && rand() < SCRATCH_CHANCE) return "scratch";
  return has.bed ? "bed" : null;
}

/**
 * 磨爪的站位：板子（中心 x,z、寬 widthM 沿 x、深 depthM 沿 z，沒有轉向）靠貓那一側的外面，離板邊 gap，面向板子中心。
 * heading 同 catwalk.ts 的 headingTo（模型正面朝 +Z）。
 */
export function scratchStand(board: { x: number; z: number; widthM: number; depthM: number }, cat: { x: number; z: number }, gap: number): { x: number; z: number; heading: number } {
  const dx = cat.x - board.x, dz = cat.z - board.z;
  const hw = board.widthM / 2, hd = board.depthM / 2;
  // 依貓在板子的哪一側（以板子的長寬比例判斷）決定站在哪個邊外
  const side = Math.abs(dx) / hw > Math.abs(dz) / hd
    ? { x: board.x + Math.sign(dx || 1) * (hw + gap), z: board.z }
    : { x: board.x, z: board.z + Math.sign(dz || 1) * (hd + gap) };
  return { ...side, heading: Math.atan2(board.x - side.x, board.z - side.z) };
}
