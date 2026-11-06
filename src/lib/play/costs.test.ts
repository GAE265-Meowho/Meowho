// 虛擬飼養 DEMO（#237）：飼料清單（處方飼料不顯示）與花費公式（照 catgame 原版 SHOP_ITEMS／shopCost；所有金額都由公式算）
import { describe, expect, it } from "vitest";
import { FOOD_PRODUCTS } from "@/lib/hq/food/catalog";
import { SHOP_FLAGS, SHOP_ITEMS, costTotal, emptyShop, foodMonthly, packGrams, playFoods, shopCost, type ShopPick } from "./costs";

describe("playFoods（飼料清單）", () => {
  it("處方飼料（requiresVetDiagnosis）一律不顯示", () => {
    const all = playFoods(null);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some(f => f.product.requiresVetDiagnosis)).toBe(false);
  });
  it("只出現皇家（其他品牌不出現）、只有乾糧和濕糧", () => {
    expect(playFoods(null).every(f => f.product.brand === "royalcanin" && ["dry", "wet"].includes(f.product.category))).toBe(true);
  });
  it("幼貓階段只列 kitten；沒參考價的標成不能買（canVirtuallyBuy）", () => {
    expect(playFoods("kitten").every(f => f.product.ages.includes("kitten"))).toBe(true);
    for (const f of playFoods(null)) expect(f.canBuy).toBe(Boolean(f.product.referencePrice?.amount));
  });
});

describe("花費公式", () => {
  it("packGrams 讀包裝重量", () => {
    expect(packGrams("2 kg")).toBe(2000);
    expect(packGrams("12 x 85 g")).toBe(1020);
    expect(packGrams("一箱")).toBeNull();
  });
  it("foodMonthly＝單價 ÷ 包裝克數 × 每日份量 × 比例 × 30 天", () => {
    // 853 元／2000 g，幼貓乾糧每天 50 g → 639.75
    expect(foodMonthly({ amount: 853, pack: "2 kg" }, "dry", "kitten")).toBe(640);
    expect(foodMonthly({ amount: 853, pack: "2 kg" }, "dry", "kitten", 0.5)).toBe(320);
    expect(foodMonthly({ amount: 853, pack: "一箱" }, "dry", "kitten")).toBeNull();
  });

  const dry = FOOD_PRODUCTS.find(p => p.category === "dry" && p.referencePrice && !p.requiresVetDiagnosis && p.ages.includes("kitten"))!;
  const wet = FOOD_PRODUCTS.find(p => p.category === "wet" && p.referencePrice && !p.requiresVetDiagnosis && p.ages.includes("kitten"))!;
  const full = (over: Partial<ShopPick> = {}): ShopPick => ({ ...emptyShop(), dryId: dry.id, litter: 1, box: 0, bowls: 0, treat: 1, fund: 1, budget: 5000, ...over });

  it("原版 shopCost：once＝砂盆＋碗＋勾選用品；month＝飼料＋貓砂＋零食＋預備金", () => {
    const c = shopCost(full(), "kitten");
    const flags = SHOP_FLAGS.scratcher[1] + SHOP_FLAGS.carrier[1] + SHOP_FLAGS.toy[1];
    expect(c.once).toBe(SHOP_ITEMS.box.opts[0][1] + SHOP_ITEMS.bowls.opts[0][1] + flags);
    expect(c.food).toBe(foodMonthly(dry.referencePrice!, "dry", "kitten"));
    expect(c.month).toBe(c.food! + SHOP_ITEMS.litter.opts[1][1] + SHOP_ITEMS.treat.opts[1][1] + SHOP_ITEMS.fund.opts[1][1]);
    expect(c.missing).toEqual([]);
  });
  it("原版估價：貓砂 礦砂 400／豆腐砂 500／木屑砂 350；外出籠 800；監視器 1,500", () => {
    expect(SHOP_ITEMS.litter.opts.map(o => o[1])).toEqual([400, 500, 350]);
    expect(SHOP_FLAGS.carrier[1]).toBe(800);
    expect(SHOP_FLAGS.cam[1]).toBe(1500);
  });
  it("乾糧加濕食：各算一半份量", () => {
    const c = shopCost(full({ wetId: wet.id }), "kitten");
    expect(c.food).toBe(foodMonthly(dry.referencePrice!, "dry", "kitten", 0.5)! + foodMonthly(wet.referencePrice!, "wet", "kitten", 0.5)!);
  });
  it("超過預算只標記不擋；還沒選的列出來", () => {
    expect(shopCost(full({ budget: 100 }), "kitten").overBudget).toBe(true);
    expect(shopCost(emptyShop(), "kitten").missing).toEqual(["飼料", "貓砂", "砂盆", "碗", "零食", "醫療預備金（每月存）"]);
  });
  it("處方飼料、待查價就算被塞進來也不算錢", () => {
    const vet = FOOD_PRODUCTS.find(p => p.requiresVetDiagnosis && p.referencePrice && p.category === "dry")!;
    expect(shopCost(full({ dryId: vet.id }), "kitten").food).toBeNull();
    const noPrice = FOOD_PRODUCTS.find(p => !p.referencePrice && !p.requiresVetDiagnosis && p.category === "dry");
    if (noPrice) expect(shopCost(full({ dryId: noPrice.id }), "kitten").food).toBeNull();
  });
  it("costTotal：五個分類加總", () => {
    expect(costTotal({ once: 1, month: 2, med: 3, acc: 4, other: 5 })).toBe(15);
  });
});
