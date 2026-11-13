// 虛擬飼養：補貨。採買時沒買的飼料，遊戲裡不能餵，除非之後補買（#354）。
// 假設：飼料目錄只有乾糧（dry）與濕糧（wet），沒有湯罐商品，所以湯罐先跟著濕糧走（有買濕糧才能餵湯罐）。
// 先用「有／沒有」，不做數量消耗。
import type { ShopPick } from "./costs";
import type { FeedKind } from "./mini3d/feed-rules";

/** 依採買結果算出這餐可以餵的種類（順序同餵貓小遊戲：乾飼料、主食罐、湯罐） */
export function feedKindsAvailable(pick: Pick<ShopPick, "dryId" | "wetId">): FeedKind[] {
  return [...(pick.dryId ? ["dry" as const] : []), ...(pick.wetId ? ["wet" as const, "soup" as const] : [])];
}

/** 補貨前後的飼養紀錄；沒有變動回 null。只列新增或換款的類別 */
export function restockNote(before: Pick<ShopPick, "dryId" | "wetId">, after: Pick<ShopPick, "dryId" | "wetId">): string | null {
  const parts = ([["dryId", "乾糧"], ["wetId", "濕糧"]] as const).filter(([k]) => after[k] && after[k] !== before[k]).map(([, n]) => n);
  if (parts.length === 0) return null;
  return `補買了${parts.join("、")}`;
}

