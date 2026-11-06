// 虛擬飼養 DEMO（#237）：飼料清單（處方飼料不顯示）與花費公式（所有金額都由公式算，AI 不產生數字）
import { describe, expect, it } from "vitest";
import { FOOD_PRODUCTS } from "@/lib/hq/food/catalog";
import {
  LITTER_TYPES, SUPPLIES, foodMonthly, packGrams, playFoods, reportCosts, shopCosts, type ShopPick,
} from "./costs";

describe("playFoods（飼料清單）", () => {
  it("處方飼料（requiresVetDiagnosis）一律不顯示", () => {
    const all = playFoods(null);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some(f => f.product.requiresVetDiagnosis)).toBe(false);
    const vet = FOOD_PRODUCTS.filter(p => p.requiresVetDiagnosis).map(p => p.id);
    expect(all.some(f => vet.includes(f.product.id))).toBe(false);
  });

  it("只出現皇家（其他品牌不出現）", () => {
    expect(playFoods(null).every(f => f.product.brand === "royalcanin")).toBe(true);
  });

  it("幼貓階段只列 kitten；沒參考價的標成不能買（canVirtuallyBuy）", () => {
    const kitten = playFoods("kitten");
    expect(kitten.every(f => f.product.ages.includes("kitten"))).toBe(true);
    for (const f of playFoods(null)) expect(f.canBuy).toBe(Boolean(f.product.referencePrice?.amount));
  });
});

describe("花費公式", () => {
  it("packGrams 讀包裝重量", () => {
    expect(packGrams("2 kg")).toBe(2000);
    expect(packGrams("400 g")).toBe(400);
    expect(packGrams("12 x 85 g")).toBe(1020);
    expect(packGrams("1 x 85 g")).toBe(85);
    expect(packGrams("一箱")).toBeNull();
  });

  it("foodMonthly＝單價 ÷ 包裝克數 × 每日份量 × 30 天，四捨五入到元", () => {
    // 853 元／2000 g，幼貓乾糧每天 50 g → 853 / 2000 * 50 * 30 = 639.75
    expect(foodMonthly({ amount: 853, pack: "2 kg" }, "dry", "kitten")).toBe(640);
    expect(foodMonthly({ amount: 853, pack: "一箱" }, "dry", "kitten")).toBeNull();
  });

  const pick = (over: Partial<ShopPick> = {}): ShopPick => ({
    foodId: FOOD_PRODUCTS.find(p => p.id === "royalcanin-2522") ? "royalcanin-2522" : null,
    litter: "tofu", supplies: ["bowl", "litter_box", "carrier"], budget: 3000, ...over,
  });

  it("shopCosts：一次性＝用品加總；每月＝飼料＋貓砂；超過預算只標記不擋", () => {
    const c = shopCosts(pick(), "kitten");
    const supplies = SUPPLIES.filter(s => ["bowl", "litter_box", "carrier"].includes(s.id)).reduce((a, s) => a + s.price, 0);
    expect(c.oneTime).toBe(supplies);
    expect(c.monthly).toBe((c.foodMonthly ?? 0) + LITTER_TYPES.find(l => l.id === "tofu")!.monthly);
    expect(c.overBudget).toBe(false);
    expect(shopCosts(pick({ budget: 100 }), "kitten").overBudget).toBe(true);
  });

  it("餐碗組、貓砂盆的價格來自 DEMO 設定檔", () => {
    expect(SUPPLIES.find(s => s.id === "bowl")!.price).toBe(399);
    expect(SUPPLIES.find(s => s.id === "litter_box")!.price).toBe(1127);
  });

  it("不能買的飼料（待查價）不算進每月花費", () => {
    const noPrice = FOOD_PRODUCTS.find(p => !p.referencePrice && !p.requiresVetDiagnosis);
    if (!noPrice) return;
    expect(shopCosts(pick({ foodId: noPrice.id }), "kitten").foodMonthly).toBeNull();
  });

  it("處方飼料就算被塞進來也不算錢", () => {
    const vet = FOOD_PRODUCTS.find(p => p.requiresVetDiagnosis && p.referencePrice)!;
    expect(shopCosts(pick({ foodId: vet.id }), "kitten").foodMonthly).toBeNull();
  });

  it("reportCosts：依劇情選擇的花費分類加總", () => {
    const shop = shopCosts(pick(), "kitten");
    const r = reportCosts(shop, [
      { category: "medical", amount: 1200 },
      { category: "medical", amount: 2500 },
      { category: "accident", amount: 1800 },
      { category: "oneTime", amount: 300 },
    ]);
    expect(r.medical).toBe(3700);
    expect(r.accident).toBe(1800);
    expect(r.oneTime).toBe(shop.oneTime + 300);
    expect(r.monthly).toBe(shop.monthly);
    expect(r.total).toBe(r.oneTime + r.medical + r.accident);
  });
});
