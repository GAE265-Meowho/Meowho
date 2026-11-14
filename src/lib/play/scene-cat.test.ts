// 虛擬飼養：掃描房間裡的貓怎麼配合劇情動作（躲外出籠、吃飯、睡床…）與 3D 逗貓的判定。純函式。
import { describe, expect, it } from "vitest";
import type { RoomObject } from "@/lib/hq/rooms/demo";
import { catchResult, funFromCatches, isCaught, sceneCatCommand } from "./scene-cat";

const obj = (id: string, name_zh: string, c: [number, number, number], size: [number, number, number], aff: Partial<RoomObject["affordance"]> = {}): RoomObject => ({
  id, label: id, name_zh, box: { center: c, size, yaw: 0 },
  affordance: { jump_on: false, hide_under: false, push: false, play: false, ...aff }, physics: { body: "fixed", surface: "wood" },
});
const objects = [
  obj("bed", "床", [2, 0.25, 2], [1.5, 0.5, 2], { jump_on: true }),
  obj("sofa", "沙發", [3, 0.4, 1], [2, 0.8, 0.9], { jump_on: true }),
  obj("shelf", "櫃子", [0.5, 0.9, 0.5], [0.6, 1.8, 0.4], { jump_on: true }),
  obj("desk", "書桌", [3.5, 0.4, 3.5], [1.2, 0.8, 0.6], { hide_under: true }),
];
const placed = [{ id: "carrier", x: 1, z: 1 }, { id: "bowl", x: 1.5, z: 3 }, { id: "litter_box", x: 3.5, z: 0.5 }];

describe("sceneCatCommand", () => {
  it("沒有動作（貓不在場）→ 躲起來看不到", () => {
    expect(sceneCatCommand(null, objects, placed)).toEqual({ kind: "hidden" });
  });
  it("躲外出籠 → 走到外出籠", () => {
    expect(sceneCatCommand("carrier", objects, placed)).toEqual({ kind: "go", x: 1, z: 1 });
    // 有外出籠尺寸：整隻縮進籠子裡（第 1 天）
    expect(sceneCatCommand("carrier", objects, placed, [{ id: "carrier", widthM: 0.33, depthM: 0.51, heightM: 0.31 }]))
      .toEqual({ kind: "tuck", carrier: { x: 1, z: 1, widthM: 0.33, depthM: 0.51, heightM: 0.31 } });
  });
  it("吃飯去碗、上廁所去貓砂盆；沒擺就隨便逛", () => {
    expect(sceneCatCommand("eat", objects, placed)).toMatchObject({ kind: "go", x: 1.5, z: 3 });
    expect(sceneCatCommand("litter", objects, placed)).toMatchObject({ kind: "go", x: 3.5, z: 0.5 });
    expect(sceneCatCommand("eat", objects, [])).toEqual({ kind: "roam" });
  });
  it("躲起來 → 走到可以躲的家具底下；沒有就躲起來看不到", () => {
    expect(sceneCatCommand("hide", objects, placed)).toEqual({ kind: "go", x: 3.5, z: 3.5 });
    expect(sceneCatCommand("hide", objects.filter(o => o.id !== "desk"), placed)).toEqual({ kind: "hidden" });
  });
  it("睡覺跳上床、沙發姿勢跳上沙發、高處跳最高的家具", () => {
    expect(sceneCatCommand("sleep", objects, placed)).toEqual({ kind: "jump", object: "bed" });
    expect(sceneCatCommand("sofa", objects, placed)).toEqual({ kind: "jump", object: "sofa" });
    expect(sceneCatCommand("high", objects, placed)).toEqual({ kind: "jump", object: "shelf" });
  });
  it("找不到能跳的家具就隨便逛；探索與一般姿勢也是隨便逛", () => {
    expect(sceneCatCommand("sleep", [], placed)).toEqual({ kind: "roam" });
    expect(sceneCatCommand("explore", objects, placed)).toEqual({ kind: "roam" });
    expect(sceneCatCommand("idle", objects, placed)).toEqual({ kind: "roam" });
  });
});

describe("3D 逗貓判定", () => {
  it("貓真的碰到玩具才算抓到：貓和玩具的距離在 30 公分內", () => {
    expect(isCaught([1, 1], [1.1, 1.05])).toBe(true);
    expect(isCaught([1, 1], [1.4, 1])).toBe(false);
    expect(isCaught([1, 1], [2, 1])).toBe(false);
  });
  it("開心度：抓到越多越高，上限 100", () => {
    expect(funFromCatches(0)).toBe(0);
    expect(funFromCatches(2)).toBeLessThan(funFromCatches(4));
    expect(funFromCatches(99)).toBe(100);
  });
  it("結果格式與原本 2D 逗貓一致（fun 50 以上算成功）", () => {
    const r = catchResult(4);
    expect(r.fun).toBe(funFromCatches(4));
    expect(r.fun >= 50).toBe(true);
    expect(catchResult(0).fun).toBe(0);
  });
});
