// 虛擬飼養的時間軸：劇本固定從 2 個月寫到 15 歲（story.ts 的 age），實際玩的貓不一定是 2 個月大。
// 這裡把劇本時間換成這隻貓的真實月齡：前半年照劇本走（到家、砂盆、半夜跑酷、結紮），之後的節點（五年後、十年後、結尾）
// 依「剩下多少年」等比例壓縮，讓結尾最多到 20 歲，不會出現 29 歲；「N 年後」的 N 也用壓縮後的年數。純函式。
export const SCRIPT_START = 2;
/** 劇本的最後一個節點離開始多久（月） */
export const SCRIPT_SPAN = 178;
/** 前半年不壓縮（月） */
const EARLY = 6;
/** 結尾最多幾歲（月） */
export const MAX_END_MONTHS = 240;

/** 從領養到結尾共幾個月：小貓 178 個月；年紀大的貓縮短，但至少 12 個月 */
export function spanMonths(startMonths: number): number {
  return Math.max(12, Math.min(SCRIPT_SPAN, MAX_END_MONTHS - startMonths));
}

/** 劇本裡的月齡（story.ts 的 age）→ 這隻貓這個時間點的真實月齡 */
export function realMonths(scriptAge: number, startMonths: number): number {
  const e = Math.max(0, scriptAge - SCRIPT_START);
  if (e <= EARLY) return startMonths + e;
  const span = spanMonths(startMonths);
  return startMonths + EARLY + (e - EARLY) * ((span - EARLY) / (SCRIPT_SPAN - EARLY));
}

/** 節點名稱：五年後、十年後會依壓縮後的年數改寫（例如「3 年後」），其他照劇本 */
export function nodeLabel(node: { id: string; label: string; age: number }, startMonths: number): string {
  if (node.id !== "year5" && node.id !== "year10") return node.label;
  const years = Math.max(1, Math.round((realMonths(node.age, startMonths) - startMonths) / 12));
  return `${years} 年後`;
}
