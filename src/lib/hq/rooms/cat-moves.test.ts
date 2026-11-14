// 貓的動作串接：起跳前轉身、跳躍動作選擇與時間點、走路配速。純函式。
import { describe, expect, it } from "vitest";
import { angleDiff, clipRate, jumpClipFor, jumpHeading, jumpKind, jumpReady, jumpTiming, moveClip, turnStep } from "./cat-moves";

describe("起跳前轉身", () => {
  it("角度差取最短的一邊", () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
  it("一次最多轉 maxTurn，轉到了就停", () => {
    expect(turnStep(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(turnStep(0, -1, 0.3)).toBeCloseTo(-0.3);
    expect(turnStep(0.9, 1, 0.3)).toBeCloseTo(1);
  });
  it("跳躍方向＝起點往落點的水平方向；原地往上跳沿用目前朝向", () => {
    expect(jumpHeading({ x: 0, z: 0 }, { x: 1, z: 0 }, 0)).toBeCloseTo(Math.PI / 2);
    expect(jumpHeading({ x: 0, z: 0 }, { x: 0, z: -1 }, 0)).toBeCloseTo(Math.PI);
    expect(jumpHeading({ x: 1, z: 1 }, { x: 1, z: 1 }, 0.7)).toBe(0.7);
  });
  it("身體面向側邊不能起跳，轉到差不多才可以", () => {
    const target = Math.PI / 2;
    expect(jumpReady(0, target)).toBe(false);
    let h = 0, steps = 0;
    while (!jumpReady(h, target)) { h = turnStep(h, target, 4 / 60); steps++; }
    expect(steps).toBeGreaterThan(10);  // 要轉一陣子
    expect(Math.abs(angleDiff(h, target))).toBeLessThanOrEqual(0.2);
  });
});

describe("跳躍動作", () => {
  const all = ["idle", "walk", "jump_a", "jump_b", "jump_c"];
  it("上檯面用 jump_a、下來用 jump_c、平跳用 jump_b", () => {
    expect(jumpKind(0, 0.5)).toBe("up");
    expect(jumpKind(0.6, 0)).toBe("down");
    expect(jumpKind(0.4, 0.45)).toBe("level");
    expect(jumpClipFor("up", all)).toEqual({ clip: "jump_a", fallback: false });
    expect(jumpClipFor("down", all)).toEqual({ clip: "jump_c", fallback: false });
    expect(jumpClipFor("level", all)).toEqual({ clip: "jump_b", fallback: false });
  });
  it("母體沒有時退回最接近的，都沒有回 null", () => {
    expect(jumpClipFor("down", ["idle", "jump_b"])).toEqual({ clip: "jump_b", fallback: true });
    expect(jumpClipFor("up", ["idle", "walk"])).toEqual({ clip: null, fallback: true });
  });
  it("從根骨頭高度找離地、落地時間（jump_a 的曲線）", () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.6];
    const y = [0, -0.01, -0.02, -0.04, -0.05, 0, 0.16, 0.27, 0.33, 0.33, 0.25, 0.09, -0.02, -0.02, 0];
    expect(jumpTiming(t, y)).toEqual({ takeoff: 0.5, land: 1.2, duration: 1.6 });
  });
  it("從高處往下跳（jump_c：起點高、終點低）", () => {
    const t = [0, 0.5, 0.73, 0.87, 1.0, 1.1, 1.23, 1.37, 2.0];
    const y = [0.64, 0.63, 0.66, 0.71, 0.41, 0.14, 0.07, -0.05, 0];
    expect(jumpTiming(t, y)).toEqual({ takeoff: 0.73, land: 1.37, duration: 2 });
  });
  it("沒有起伏讀不到", () => {
    expect(jumpTiming([0, 1, 2], [0, 0, 0])).toBeNull();
  });
});

describe("走路配速", () => {
  it("快才跑，沒有跑步動作就走", () => {
    expect(moveClip(1.9, ["walk", "run"])).toBe("run");
    expect(moveClip(1.9, ["walk"])).toBe("walk");
    expect(moveClip(0.35, ["walk", "run"])).toBe("walk");
  });
  it("播放速度跟移動速度成正比，有上下限", () => {
    expect(clipRate(0.35, 0.35)).toBe(1);
    expect(clipRate(0.7, 0.35)).toBe(2);
    expect(clipRate(5, 0.35)).toBe(3);
    expect(clipRate(0.01, 0.35)).toBe(0.3);
  });
});
