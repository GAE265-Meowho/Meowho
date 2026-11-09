import { describe, expect, it } from "vitest";
import { catActions, firstAction } from "./cat-actions";
import { confirmedLook } from "./cat-publish";

describe("catActions", () => {
  it("只列 glb 有、動作庫 ready 的動作，照動作庫順序，跳躍換成前台說法", () => {
    expect(catActions(["walk", "idle", "jump_a", "cuddle", "mystery"])).toEqual([
      { code: "idle", label: "待機" }, { code: "walk", label: "走路" }, { code: "jump_a", label: "跳上去" },
    ]);
  });
  it("一開始播待機，沒有就第一個，都沒有回 null", () => {
    expect(firstAction(["walk", "idle"])).toBe("idle");
    expect(firstAction(["walk"])).toBe("walk");
    expect(firstAction([])).toBeNull();
  });
});

describe("confirmedLook", () => {
  const url = "https://x.supabase.co";
  it("取這隻貓體型的確認貼圖；預設 3D 貓用母體貼圖（null）", () => {
    expect(confirmedLook([{ body_type: "kitten", confirmed_albedo: "cat_1/paint_albedo.png" }], "kitten", url)).toEqual({
      body: "kitten", base: "/api/hq/cat-models/base?body=kitten", albedo: `${url}/storage/v1/object/public/meow-cat-models/cat_1/paint_albedo.png`,
    });
    expect(confirmedLook([{ body_type: "adult", confirmed_albedo: "default" }], "senior", url)).toEqual({ body: "adult", base: "/api/hq/cat-models/base", albedo: null });
  });
  it("還沒確認、體型對不上或沒有模型回 null", () => {
    expect(confirmedLook([{ body_type: "adult", confirmed_albedo: null }], "adult", url)).toBeNull();
    expect(confirmedLook([{ body_type: "kitten", confirmed_albedo: "default" }], "adult", url)).toBeNull();
    expect(confirmedLook(null, "adult", url)).toBeNull();
  });
});
