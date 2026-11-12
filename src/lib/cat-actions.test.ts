import { describe, expect, it } from "vitest";
import { idleClips, nextIdle } from "./cat-actions";
import { confirmedLook } from "./cat-publish";

/** 固定序列的亂數，測試才穩定 */
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const ALL = ["idle", "walk", "sit", "sleep", "toilet", "jump_a", "cuddle"];

describe("idleClips", () => {
  it("只排 glb 有、動作庫 ready 的原地動作；走路、跳躍不排；吃喝有待機就能用程式版", () => {
    expect(idleClips(ALL).sort()).toEqual(["cuddle", "drink", "eat", "idle", "sit", "sleep", "toilet"]);
    expect(idleClips(["walk"])).toEqual([]);
  });

  it("休息（蜷曲，8 秒循環）至少播完一輪（#387）", () => {
    const pool = idleClips(["idle", "rest"]);
    const i = pool.indexOf("rest");
    expect(nextIdle(seq((i + 0.5) / pool.length, 0), ["idle", "rest"], null)).toEqual({ clip: "rest", seconds: 8 });
  });

  it("母體有四腳朝天（belly_up）時也會排進原地動作（#379）", () => {
    expect(idleClips(["idle", "belly_up"])).toContain("belly_up");
  });
});

describe("nextIdle", () => {
  it("從可排的動作裡挑一個，秒數在範圍內", () => {
    const pool = idleClips(ALL);
    const i = pool.indexOf("sit");
    const s = nextIdle(seq((i + 0.5) / pool.length, 0), ALL, null);
    expect(s).toEqual({ clip: "sit", seconds: 5 });
  });
  it("不連續做同一個動作", () => {
    for (const r of [0, 0.3, 0.6, 0.99]) expect(nextIdle(seq(r, 0.5), ALL, { clip: "sit", seconds: 5 }).clip).not.toBe("sit");
  });
  it("睡完先待機", () => {
    expect(nextIdle(seq(0.9, 0.5), ALL, { clip: "sleep", seconds: 10 }).clip).toBe("idle");
  });
  it("什麼都沒有就待機", () => {
    expect(nextIdle(seq(0.5), [], null).clip).toBe("idle");
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
