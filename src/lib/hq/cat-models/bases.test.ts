import { describe, expect, it } from "vitest";
import { BASE_TABS, baseInfo, baseTabHref, isPreviewBody, previewBaseUrl, previewDownloadUrl, previewFileName, previewFraming, resolveBaseTab } from "./bases";

describe("體型預覽分頁（#302）", () => {
  it("分頁依序為大貓、成貓、幼貓、奔跑貓（#331）", () => {
    expect(BASE_TABS.map(t => [t.value, t.label])).toEqual([["large", "大貓"], ["adult", "成貓"], ["kitten", "幼貓"], ["runner", "奔跑貓"]]);
  });

  it("奔跑貓（#331）：public 靜態檔、成貓取景、參考照片、不自動套用", () => {
    expect(isPreviewBody("runner")).toBe(true);
    expect(previewBaseUrl("runner")).toBe("/hq-cat-models/base/cat_runner_tabby.glb");
    expect(previewDownloadUrl("runner")).toBe("/hq-cat-models/base/cat_runner_tabby.glb");
    expect(previewFileName("runner")).toBe("cat_runner_tabby.glb");
    expect(previewFraming("runner")).toBe("adult");
    const info = baseInfo("runner");
    expect(info.label).toBe("奔跑貓");
    expect(info.photos.map(p => p.src)).toEqual(["/hq-cat-models/base/runner_ref_side.jpg", "/hq-cat-models/base/runner_ref_3q.jpg"]);
    expect(info.autoApply).toBe(false);
    expect(info.facts.find(f => f.label === "動作")?.value).toMatch(/奔跑.*理毛/);
  });

  it("網址 ?body= 不合法或沒填時預設大貓", () => {
    expect(resolveBaseTab(undefined)).toBe("large");
    expect(resolveBaseTab("dog")).toBe("large");
    expect(resolveBaseTab("kitten")).toBe("kitten");
    expect(isPreviewBody("adult")).toBe(true);
    expect(isPreviewBody("large")).toBe(true);
    expect(isPreviewBody("big")).toBe(false);
  });

  it("分頁連結帶 ?body=", () => {
    expect(baseTabHref("large")).toBe("/MeowHQ/assets/bases?body=large");
    expect(baseTabHref("kitten")).toBe("/MeowHQ/assets/bases?body=kitten");
  });

  it("大貓用 public 靜態檔；成貓、幼貓沿用母體 API", () => {
    expect(previewBaseUrl("large")).toBe("/hq-cat-models/base/base_clips_large.glb");
    expect(previewDownloadUrl("large")).toBe("/hq-cat-models/base/base_clips_large.glb");
    expect(previewFileName("large")).toBe("base_clips_large.glb");
    expect(previewBaseUrl("adult")).toBe("/api/hq/cat-models/base");
    expect(previewBaseUrl("kitten")).toBe("/api/hq/cat-models/base?body=kitten");
    expect(previewDownloadUrl("kitten")).toBe("/api/hq/cat-models/base?body=kitten&download=1");
    expect(previewFileName("adult")).toBe("base_clips.glb");
  });

  it("大貓沿用成貓取景（體長相近）", () => {
    expect(previewFraming("large")).toBe("adult");
    expect(previewFraming("kitten")).toBe("kitten");
  });

  it("大貓資訊含參考照片與 CC-BY 來源；成貓、幼貓沒有參考照片", () => {
    const large = baseInfo("large");
    expect(large.photos.map(p => p.src)).toEqual(["/hq-cat-models/base/large_ref_side.jpg", "/hq-cat-models/base/large_ref_3q.jpg"]);
    expect(large.photos.every(p => p.alt.length > 0)).toBe(true);
    expect(large.source?.license).toBe("CC-BY 4.0");
    expect(large.source?.url).toMatch(/^https:\/\/sketchfab\.com\//);
    expect(large.autoApply).toBe(false);
    expect(baseInfo("adult").photos).toEqual([]);
    expect(baseInfo("adult").autoApply).toBe(true);
    expect(baseInfo("kitten").tags).toContain("6 個月以下");
  });
});
