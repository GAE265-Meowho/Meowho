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

  it("沒有 CAT_STUDIO_ROOT 時改走 bundled", () => {
    expect(resolveCatSource({ NODE_ENV: "production", CAT_STUDIO_ROOT: "" })).toBe("bundled");
    expect(resolveCatSource({ NODE_ENV: "development", CAT_STUDIO_ROOT: "C:\\x" })).toBe("local");
  });
});
