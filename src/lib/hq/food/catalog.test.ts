import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import report from "./import-report.json";
import { FOOD_PRODUCTS, foodProducts, formatFoodPrice, getFoodProduct, canVirtuallyBuy } from "./catalog";

describe("皇家食物共用目錄", () => {
  it("完整匯入 sitemap 商品、ID 不重複、沒有失敗品項", () => {
    expect(report.failures).toEqual([]);
    expect(FOOD_PRODUCTS).toHaveLength(report.discovered);
    expect(new Set(FOOD_PRODUCTS.map(p => p.id)).size).toBe(FOOD_PRODUCTS.length);
    for (const category of ["dry", "wet", "liquid"] as const) expect(foodProducts({ categories: [category] }).length).toBeGreaterThan(0);
    expect(getFoodProduct("royalcanin-2522")?.name).toContain("K36");
    expect(getFoodProduct("unknown")).toBeUndefined();
  });
  it("同組 OR、跨組 AND，空組不限制", () => {
    expect(foodProducts({ categories: ["dry", "wet"] }).length).toBeGreaterThan(foodProducts({ categories: ["dry"] }).length);
    const filtered = foodProducts({ categories: ["dry"], ages: ["kitten"] });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(p => p.category === "dry" && p.ages.includes("kitten"))).toBe(true);
    expect(foodProducts({})).toHaveLength(FOOD_PRODUCTS.length);
    expect(foodProducts({ query: "不存在的商品" })).toEqual([]);
    expect(foodProducts({ neutered: ["neutered"] }).length).toBeGreaterThan(0);
    expect(foodProducts({ neutered: ["neutered"] }).every(p => p.neutered.some(n => n.code === "neutered"))).toBe(true);
  });
  it("照片落地，詳細資訊只連台灣官方，參考價對應正確包裝", () => {
    for (const p of FOOD_PRODUCTS) {
      const url = new URL(p.officialUrl);
      expect(url.hostname).toBe("www.royalcanin.com");
      expect(url.pathname).toMatch(/^\/tw\/cats\/products\/(retail|vet)-products\//);
      expect(existsSync(path.join(process.cwd(), "public", p.image))).toBe(true);
      expect(p.currency).toBe("TWD");
      for (const key of ["ingredients", "nutritionalInfo", "description", "benefits"]) expect(p).not.toHaveProperty(key);
      if (p.referencePrice) {
        expect(p.referencePrice.amount).toBeGreaterThan(0);
        expect(p.packs.map(x => x.label)).toContain(p.referencePrice.pack);
        expect(p.referencePrice.url).toMatch(/^https:\/\//);
      }
    }
  });
  it("未查價不是免費；獸醫配方需要診斷紀錄", () => {
    expect(formatFoodPrice(null)).toBe("待查價");
    expect(formatFoodPrice(0)).toBe("待查價");
    expect(formatFoodPrice(1080)).toBe("TWD 1,080");
    expect(canVirtuallyBuy(undefined, true)).toBe(false);
    expect(canVirtuallyBuy(getFoodProduct("royalcanin-2522"), false)).toBe(true);
    const vet = FOOD_PRODUCTS.find(p => p.requiresVetDiagnosis)!;
    const priced = { ...vet, referencePrice: { amount: 100, pack: "test", source: "test", url: "https://example.com", checkedOn: "2026-11-04", note: "" } };
    expect(canVirtuallyBuy(priced, false)).toBe(false);
    expect(canVirtuallyBuy(priced, true)).toBe(true);
    expect(canVirtuallyBuy({ ...vet, referencePrice: null }, true)).toBe(false);
  });
  it("所有圖片實際是 WebP 且參考價沒有錯誤的零值", async () => {
    const { readFileSync } = await import("node:fs");
    for (const product of FOOD_PRODUCTS) {
      const buffer = readFileSync(path.join(process.cwd(), "public", product.image));
      expect(buffer.subarray(0,4).toString()).toBe("RIFF");
      expect(buffer.subarray(8,12).toString()).toBe("WEBP");
      if (!product.referencePrice) expect(canVirtuallyBuy(product, true)).toBe(false);
    }
  });
});
