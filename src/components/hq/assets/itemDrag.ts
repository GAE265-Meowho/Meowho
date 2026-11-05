// 虛擬體驗：生活用品從右側選單拖進 3D 空間（#197）
export const HOUSEHOLD_ITEM_MIME = "application/x-meow-household-item";

export function setItemDragData(dt: DataTransfer, itemId: string) {
  dt.setData(HOUSEHOLD_ITEM_MIME, itemId);
  dt.setData("text/plain", itemId);
  dt.effectAllowed = "copy";
}

export function readItemDragId(dt: DataTransfer): string | null {
  const id = dt.getData(HOUSEHOLD_ITEM_MIME) || dt.getData("text/plain");
  return id.trim() || null;
}
