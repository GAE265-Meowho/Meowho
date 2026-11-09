import { describe, expect, it } from "vitest";
import { BOUNDS, nextPlan, randomSpot, stepToward, wanderClips, type Plan } from "./cat-actions";
import { confirmedLook } from "./cat-publish";

/** 固定序列的亂數，測試才穩定 */
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const ALL = ["idle", "walk", "sit", "sleep", "toilet", "jump_a", "cuddle"];

describe("wanderClips", () => {
  it("只排 glb 有、動作庫 ready 的動作；跳躍不排；吃喝有待機就能用程式版", () => {
    expect(wanderClips(ALL).sort()).toEqual(["drink", "eat", "idle", "sit", "sleep", "toilet"]);
    expect(wanderClips(["walk"])).toEqual([]);
  });
});

describe("nextPlan", () => {
  const at = { x: 0, z: 0 };
  it("原地動作做完，多半先走去別處", () => {
    const last: Plan = { to: null, face: null, clip: "sit", seconds: 5 };
    const p = nextPlan(seq(0.1, 0.9, 0.9), ALL, at, last);
    expect(p.to).not.toBeNull();
    expect(Math.hypot(p.to!.x, p.to!.z)).toBeGreaterThanOrEqual(0.4);
  });
  it("睡完一定起來走走", () => {
    const p = nextPlan(seq(0.99, 0.5, 0.5), ALL, at, { to: null, face: null, clip: "sleep", seconds: 10 });
    expect(p.to).not.toBeNull();
  });
  it("排到的動作在原地做", () => {
    const pool = wanderClips(ALL);
    const i = pool.indexOf("toilet");
    const p = nextPlan(seq((i + 0.5) / pool.length, 0.5), ALL, at, null);
    expect(p).toMatchObject({ to: null, clip: "toilet" });
  });
  it("沒有走路動作就都在原地", () => {
    const p = nextPlan(seq(0.1, 0.5), ["idle", "sit"], at, { to: null, face: null, clip: "sit", seconds: 5 });
    expect(p.to).toBeNull();
    expect(p.clip).toBe("idle");
  });
});

describe("randomSpot／stepToward", () => {
  it("隨機點在範圍內", () => {
    const p = randomSpot(seq(0.99, 0.01), { x: 0, z: 0 });
    expect(p.x).toBeLessThanOrEqual(BOUNDS.maxX);
    expect(p.z).toBeGreaterThanOrEqual(BOUNDS.minZ);
  });
  it("一步步走到目標，面向走的方向", () => {
    const a = stepToward({ x: 0, z: 0 }, { x: 0, z: 1 }, 0.5, 1);
    expect(a).toEqual({ at: { x: 0, z: 0.5 }, heading: 0, arrived: false });
    expect(stepToward(a.at, { x: 0, z: 1 }, 0.5, 1).arrived).toBe(true);
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
