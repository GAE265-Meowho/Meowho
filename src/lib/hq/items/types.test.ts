import { describe, expect, it } from "vitest";
import { checkGlb, filterItems, formatItemPrice, normalizeItemMeters, type HouseholdItem } from "./types";

const sample = (partial: Partial<HouseholdItem> & Pick<HouseholdItem, "id" | "name" | "categoryId">): HouseholdItem => ({
  nameEn: null, categoryName: "貓砂盆", priceTwd: 1127, instructions: null,
  modelPath: "a/model.glb", modelUrl: "https://example/a/model.glb",
  widthM: 0.5, depthM: 0.4, heightM: 0.35, createdAt: "2026-11-04T00:00:00Z",
  ...partial,
});

describe("生活用品型別與篩選", () => {
  it("檢查 glb 格式與 20MB 上限", () => {
    expect(checkGlb("model/gltf-binary", 1000)).toBeNull();
    expect(checkGlb("image/png", 1000)).toBe("file_invalid");
    expect(checkGlb("model/gltf-binary", 21 * 1024 * 1024)).toBe("file_too_large");
  });

  it("毫米／公分匯出會自動換成公尺", () => {
    expect(normalizeItemMeters({ x: 500, y: 350, z: 400 })).toMatchObject({ scale: 0.001, widthM: 0.5, heightM: 0.35, depthM: 0.4 });
    expect(normalizeItemMeters({ x: 50, y: 35, z: 40 })).toMatchObject({ scale: 0.01, widthM: 0.5 });
    expect(normalizeItemMeters({ x: 0.5, y: 0.35, z: 0.4 }).warning).toBeNull();
  });

  it("依類別與關鍵字篩選", () => {
    const items = [
      sample({ id: "1", name: "貓砂盆", categoryId: "litter_box", categoryName: "貓砂盆", nameEn: "Litter Box" }),
      sample({ id: "2", name: "陶瓷碗", categoryId: "bowls", categoryName: "餐碗水碗", priceTwd: null }),
    ];
    expect(filterItems(items, { categoryIds: ["bowls"] }).map(i => i.id)).toEqual(["2"]);
    expect(filterItems(items, { query: "litter" }).map(i => i.id)).toEqual(["1"]);
    expect(formatItemPrice(null)).toBe("價格未定");
    expect(formatItemPrice(1127)).toBe("NT$1,127");
  });
});
