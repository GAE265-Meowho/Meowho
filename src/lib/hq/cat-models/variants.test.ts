import { describe, expect, it } from "vitest";
import { confirmVariant, legacyVariants, prepareVariant, restoreVariant, variantTexture } from "./variants";

describe("#104 同一隻貓的兩種體型", () => {
  it("舊成貓貼圖留在成貓欄，幼貓仍是未製作", () => {
    const variants = legacyVariants({ albedo: "adult.png", prev: null, baseVersion: "v1", prevBaseVersion: null, confirmed: "adult.png", ageMonths: 3 });
    expect(variants.adult?.albedo).toBe("adult.png");
    expect(variants.kitten).toBeUndefined();
    expect(variantTexture(variants, "kitten").preview).toBeNull();
  });

  it("舊目前版與上一版屬不同體型時分開保存", () => {
    const variants = legacyVariants({ albedo: "kitten.png", prev: "adult.png", baseVersion: "kitten-v1", prevBaseVersion: "adult-v1", confirmed: "adult.png", ageMonths: 4 });
    expect(variants.kitten?.albedo).toBe("kitten.png");
    expect(variants.kitten?.prev).toBeNull();
    expect(variants.adult?.albedo).toBe("adult.png");
    expect(variants.adult?.confirmed).toBe("adult.png");
    expect(variantTexture(variants, "kitten").preview).toBeNull();
    expect(variantTexture(variants, "adult").preview).toBe("albedo");
  });

  it("同體型上一版仍可換回，不會變成另一體型", () => {
    const variants = legacyVariants({ albedo: "new.png", prev: "old.png", baseVersion: "kitten-v1", prevBaseVersion: "kitten-v1", confirmed: "new.png", ageMonths: 4 });
    expect(variants.kitten?.prev).toBe("old.png");
    expect(variants.adult).toBeUndefined();
  });

  it("重新產生只清理所選體型未確認的版本", () => {
    const kitten = { albedo: "pending.png", prev: "approved.png", baseVersion: "kitten-v1", prevBaseVersion: "kitten-v1", confirmed: "approved.png" };
    expect(prepareVariant(kitten)).toEqual({ variant: { ...kitten, albedo: "approved.png", prev: null, prevBaseVersion: null, confirmed: "approved.png" }, remove: "pending.png" });
  });

  it("確認及換回上一版只處理同一體型", () => {
    const adult = { albedo: "new.png", prev: "old.png", baseVersion: "adult-v1", prevBaseVersion: "adult-v1", confirmed: "old.png" };
    expect(confirmVariant(adult).confirmed).toBe("new.png");
    expect(restoreVariant(adult)).toEqual({ albedo: "old.png", prev: "new.png", baseVersion: "adult-v1", prevBaseVersion: "adult-v1", confirmed: "old.png" });
  });
});
