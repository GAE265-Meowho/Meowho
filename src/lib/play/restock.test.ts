import { describe, expect, it } from "vitest";
import { defaultShop, playFoods, shopCost } from "./costs";
import { initialPlay, playReducer } from "./flow";
import { feedKindsAvailable, restockNote } from "./restock";

const dry = playFoods("adult").find(f => f.canBuy && f.product.category === "dry")!.product;
const wet = playFoods("adult").find(f => f.canBuy && f.product.category === "wet")!.product;
const pick = (dryId: string | null, wetId: string | null) => ({ ...defaultShop(), dryId, wetId });

describe("可以餵的種類", () => {
  it("只買乾糧：只能餵乾飼料", () => expect(feedKindsAvailable(pick(dry.id, null))).toEqual(["dry"]));
  it("只買濕糧：主食罐與湯罐（湯罐跟著濕糧走）", () => expect(feedKindsAvailable(pick(null, wet.id))).toEqual(["wet", "soup"]));
  it("都買：三種都能餵", () => expect(feedKindsAvailable(pick(dry.id, wet.id))).toEqual(["dry", "wet", "soup"]));
  it("都沒買：一種都沒有", () => expect(feedKindsAvailable(pick(null, null))).toEqual([]));
});

describe("補貨紀錄", () => {
  it("補買濕糧", () => expect(restockNote(pick(dry.id, null), pick(dry.id, wet.id))).toBe("補買了濕糧"));
  it("補買乾糧", () => expect(restockNote(pick(null, wet.id), pick(dry.id, wet.id))).toBe("補買了乾糧"));
  it("換款也算", () => expect(restockNote(pick(dry.id, null), pick(dry.id, wet.id))).not.toBeNull());
  it("沒有變動不記", () => expect(restockNote(pick(dry.id, wet.id), pick(dry.id, wet.id))).toBeNull());
});

describe("補貨 action", () => {
  it("更新每月花費並記一筆 note，之後的節點用新的每月花費", () => {
    const before = pick(dry.id, null), after = pick(dry.id, wet.id);
    const m0 = shopCost(before, "adult").month, m1 = shopCost(after, "adult").month;
    let s = playReducer(initialPlay(), { type: "startNodes", catName: "麻糬", labels: [], once: 0, monthly: m0 });
    s = playReducer(s, { type: "restock", monthly: m1, note: "補買了濕糧" });
    expect(s.monthly).toBe(m1);
    expect(s.life.notes.at(-1)).toMatchObject({ t: "補買了濕糧", spent: 0 });
    expect(s.life.cost.month).toBe(playReducer(initialPlay(), { type: "startNodes", catName: "麻糬", labels: [], once: 0, monthly: m0 }).life.cost.month);
  });
});

import { applyPurchase, emptySel, hasPurchase, purchaseDelta, toggleSel } from "./restock";

describe("補貨選取與購買", () => {
  const dry2 = playFoods("adult").filter(f => f.canBuy && f.product.category === "dry")[1]?.product ?? dry;
  it("點一下選取、再點一下取消", () => {
    const a = toggleSel(emptySel(), "wetId", wet.id);
    expect(a.wetId).toBe(wet.id);
    expect(toggleSel(a, "wetId", wet.id).wetId).toBeNull();
  });
  it("乾糧濕糧可各選一款，同類選另一款就換掉", () => {
    let sel = toggleSel(toggleSel(emptySel(), "dryId", dry.id), "wetId", wet.id);
    expect(sel).toEqual({ dryId: dry.id, wetId: wet.id });
    sel = toggleSel(sel, "dryId", dry2.id);
    expect(sel.dryId).toBe(dry2.id);
  });
  it("選了還沒購買：pick 不變；沒選任何東西不能購買", () => {
    const p = pick(dry.id, null);
    expect(hasPurchase(p, emptySel())).toBe(false);
    expect(hasPurchase(p, { dryId: dry.id, wetId: null })).toBe(false);
    expect(hasPurchase(p, { dryId: null, wetId: wet.id })).toBe(true);
  });
  it("購買後 pick 更新，沒選的類別維持原本", () => {
    const next = applyPurchase(pick(dry.id, null), { dryId: null, wetId: wet.id });
    expect(next.dryId).toBe(dry.id);
    expect(next.wetId).toBe(wet.id);
  });
  it("每月增加的花費等於 shopCost 的差；買完 flow 的 monthly 跟著變", () => {
    const p = pick(dry.id, null), sel = { dryId: null, wetId: wet.id };
    const delta = purchaseDelta(p, sel, "adult");
    expect(delta).toBe(shopCost(applyPurchase(p, sel), "adult").month - shopCost(p, "adult").month);
    expect(purchaseDelta(p, emptySel(), "adult")).toBe(0);
    let s = playReducer(initialPlay(), { type: "startNodes", catName: "麻糬", labels: [], once: 0, monthly: shopCost(p, "adult").month });
    s = playReducer(s, { type: "restock", monthly: shopCost(applyPurchase(p, sel), "adult").month, note: "補買了濕糧" });
    expect(s.monthly - shopCost(p, "adult").month).toBe(delta);
  });
});
