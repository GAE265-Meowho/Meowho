import { describe, expect, it } from "vitest";
import { PET_VIEW, petOrbit } from "./pet-view";

const target: [number, number, number] = [0, 0.24, -0.025];
const start: [number, number, number] = [0.92, 0.52, 0.57];
const dist = (p: [number, number, number]) => Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);

describe("摸貓：旁邊的方向鍵轉視角（渝茜 2026-11-16：滑鼠只摸貓，不轉畫面）", () => {
  it("左右繞著貓轉，距離不變", () => {
    const p = petOrbit(start, target, 1, 0);
    expect(dist(p)).toBeCloseTo(dist(start), 6);
    expect(p[0]).not.toBeCloseTo(start[0], 3);
    expect(p[1]).toBeCloseTo(start[1], 6);  // 左右轉高度不變
  });
  it("左右轉一圈會回到原處（可以一直轉）", () => {
    let p = start;
    const n = Math.round((2 * Math.PI) / PET_VIEW.yawStep);
    for (let i = 0; i < n; i++) p = petOrbit(p, target, 1, 0);
    expect(p[0]).toBeCloseTo(start[0], 1);
    expect(p[2]).toBeCloseTo(start[2], 1);
  });
  it("上下有上限：不會轉到貓正上方或地板下面", () => {
    let up = start, down = start;
    for (let i = 0; i < 100; i++) { up = petOrbit(up, target, 0, 1); down = petOrbit(down, target, 0, -1); }
    const polar = (p: [number, number, number]) => Math.acos((p[1] - target[1]) / dist(p));
    expect(polar(up)).toBeCloseTo(PET_VIEW.minPolar, 4);
    expect(polar(down)).toBeCloseTo(PET_VIEW.maxPolar, 4);
    expect(dist(up)).toBeCloseTo(dist(start), 6);
  });
});
