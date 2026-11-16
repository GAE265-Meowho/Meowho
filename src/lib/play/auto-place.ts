// 擺用品：點用品就自動放進房間（渝茜 2026-11-16：拿掉「快速放」那一排）。純函式。
// 掃描房間：位置是「某家具旁」的標籤（RoomViewer 依標籤算出實際位置，不和別的用品重疊）；
// 放好後跳一個半透明的「點選移動」提示框，玩家點地板或拖曳就能換位置，點一下提示框就關掉。

/** 從候選位置挑第一個還沒被別的用品佔走的；都被佔走就退回最後一個（通常是「房間角落」）。沒有候選回 null */
export function autoSpot(spots: readonly { label: string }[], used: readonly (string | undefined)[]): string | null {
  if (!spots.length) return null;
  const taken = new Set(used.filter((u): u is string => Boolean(u)));
  return (spots.find(s => !taken.has(s.label)) ?? spots[spots.length - 1]).label;
}

/** 「點選移動」提示框：這一步自動放過東西、而且玩家還沒點掉過才顯示 */
export function showMoveHint({ autoPlaced, dismissed }: { autoPlaced: boolean; dismissed: boolean }): boolean {
  return autoPlaced && !dismissed;
}
