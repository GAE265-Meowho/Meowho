// 虛擬飼養：補貨。採買時沒買的飼料，遊戲裡不能餵，除非之後補買（#354）。
// 假設：飼料目錄只有乾糧（dry）與濕糧（wet），沒有湯罐商品，所以湯罐先跟著濕糧走（有買濕糧才能餵湯罐）。
// 先用「有／沒有」，不做數量消耗。
import { shopCost, type PlayShop, type ShopPick, type Stage } from "./costs";
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


/** 補貨視窗的待購選擇：乾糧、濕糧各最多一款，還沒按「購買」，不算家裡有 */
export type RestockSel = Pick<ShopPick, "dryId" | "wetId">;
export const emptySel = (): RestockSel => ({ dryId: null, wetId: null });

/** 點一下選取、再點一下取消；同類只能一款，選另一款就換掉 */
export function toggleSel(sel: RestockSel, key: keyof RestockSel, id: string): RestockSel {
  return { ...sel, [key]: sel[key] === id ? null : id };
}

/** 按「購買」後的 pick：有選的類別換成選的款，沒選的維持原本 */
export function applyPurchase(pick: ShopPick, sel: RestockSel): ShopPick {
  return { ...pick, dryId: sel.dryId ?? pick.dryId, wetId: sel.wetId ?? pick.wetId };
}

/** 這次購買會增加的每月花費（只用 shopCost 的差）；沒有新增飼料或款式一樣就是 0，換成便宜款可能為負 */
export function purchaseDelta(pick: ShopPick, sel: RestockSel, stage: Stage, shop?: PlayShop): number {
  const next = applyPurchase(pick, sel);
  return shopCost(next, stage, shop).month - shopCost(pick, stage, shop).month;
}

/** 有沒有真的新增或換款（購買鈕要不要啟用） */
export const hasPurchase = (pick: ShopPick, sel: RestockSel): boolean =>
  (!!sel.dryId && sel.dryId !== pick.dryId) || (!!sel.wetId && sel.wetId !== pick.wetId);
