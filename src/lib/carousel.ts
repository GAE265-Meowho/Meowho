// 照片輪播（貓咪頁，#354）：由捲動位置算出現在是第幾張。

/** 捲到一半以上才算下一張；寬度還沒量到（0）或沒有照片時回傳 0 */
export function slideIndex(scrollLeft: number, slideWidth: number, count: number): number {
  if (count <= 0 || slideWidth <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / slideWidth)));
}

/** 上一張／下一張：到頭尾就停住，不繞回去 */
export function stepIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, current + delta));
}
