import { describe, expect, it } from "vitest";
import { bundledBasePublicPath, bundledEnabled, bundledFilePublicPath, getBundledCat, listBundledCats } from "./bundled";
import { resolveCatSource } from "./repo";

describe("bundled 示範貓", () => {
  it("有至少一隻已完成的貓可預覽", () => {
    expect(bundledEnabled()).toBe(true);
    const cats = listBundledCats();
    expect(cats.length).toBeGreaterThanOrEqual(1);
    expect(cats[0].hasAlbedo).toBe(true);
    expect(cats[0].status).toBe("ready");
  });

  it("檔案路徑在 public/hq-cat-models", () => {
    const id = listBundledCats()[0].id;
    expect(bundledFilePublicPath(id, "photo")).toBe(`/hq-cat-models/cats/${id}/photo.jpg`);
    expect(bundledFilePublicPath(id, "albedo")).toBe(`/hq-cat-models/cats/${id}/paint_albedo.png`);
    expect(bundledFilePublicPath(id, "albedo_prev")).toBeNull();
    expect(bundledBasePublicPath()).toBe("/hq-cat-models/base/base_clips.glb");
    expect(getBundledCat("cat_99999999_999999")).toBeNull();
  });

  it("好奇虎斑小貓併進第一隻虎斑貓：同一隻貓有成貓、幼貓兩個體型，預設成貓", () => {
    expect(getBundledCat("cat_20261101_183700")).toBeNull();
    const cat = getBundledCat("cat_20261030_140731")!;
    expect(cat.body).toBe("adult");
    expect(cat.variantStorage).toBe(true);
    expect(cat.bodyVariants?.kitten).toMatchObject({ albedoUrl: "/hq-cat-models/cats/cat_20261030_140731/paint_albedo_kitten.png", baseVersion: "kitten-v1", texture: { state: "confirmed", previewBody: "kitten" } });
    expect(cat.bodyVariants?.adult?.albedoUrl).toBe("/hq-cat-models/cats/cat_20261030_140731/paint_albedo.png");
    expect(bundledFilePublicPath("cat_20261030_140731", "albedo_kitten")).toBe("/hq-cat-models/cats/cat_20261030_140731/paint_albedo_kitten.png");
    expect(bundledBasePublicPath("kitten")).toBe("/hq-cat-models/base/base_clips_kitten.glb");
  });

  it("沒有 CAT_STUDIO_ROOT 時改走 bundled", () => {
    expect(resolveCatSource({
      NODE_ENV: "production", CAT_STUDIO_ROOT: "",
      NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
    })).toBe("bundled");
    expect(resolveCatSource({ NODE_ENV: "development", CAT_STUDIO_ROOT: "C:\\x" })).toBe("local");
  });
});

