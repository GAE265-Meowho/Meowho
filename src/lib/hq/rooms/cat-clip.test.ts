// 穿模檢查（#354 第 2 份附帶）：不開畫面，讓掃描房間的貓在一間「床、櫃子、書桌、電扇＋四件用品」的房間裡自己逛，
// 每一格量貓的身體（鼻尖、肩、腰、臀）壓進家具或用品多深。家具的真實範圍比擋路的格子小一點，和掃描結果一樣。
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/play/audio-player", () => ({ playSfx: () => {} }));
import { RoomCat } from "./cat";
import { footprintCells } from "@/lib/play/scene-items";

interface Rect { x: number; z: number; hx: number; hz: number; kind: "furniture" | "item" }
const NX = 40, CELL = 0.1, ADULT_M = 0.3, MODEL_HEIGHT_M = 0.508;
const FURNITURE: Rect[] = [
  { x: 1.0, z: 1.2, hx: 0.75, hz: 1.0, kind: "furniture" },   // 床
  { x: 3.2, z: 0.45, hx: 0.55, hz: 0.25, kind: "furniture" }, // 櫃子
  { x: 3.6, z: 2.4, hx: 0.25, hz: 0.7, kind: "furniture" },   // 層架
  { x: 1.6, z: 3.5, hx: 0.9, hz: 0.33, kind: "furniture" },   // 書桌
  { x: 2.45, z: 2.05, hx: 0.22, hz: 0.22, kind: "furniture" }, // 電扇
];
const ITEMS = [
  { x: 2.2, z: 0.9, widthM: 0.45, depthM: 0.25 },  // 餐碗組
  { x: 2.9, z: 3.3, widthM: 0.5, depthM: 0.4 },    // 貓砂盆
  { x: 0.5, z: 2.75, widthM: 0.5, depthM: 0.32 },  // 外出籠
  { x: 2.3, z: 2.9, widthM: 0.4, depthM: 0.4 },    // 貓抓板
];
/** 母體站姿量到的身體輪廓（公尺，模型高 0.508；x 向左、z 向前），不含尾巴 */
const BODY: [number, number, "nose" | "side"][] = [[0, 0.245, "nose"], [0.085, 0.15, "side"], [-0.085, 0.15, "side"], [0.1, 0, "side"], [-0.1, 0, "side"], [0.085, -0.2, "side"], [-0.085, -0.2, "side"], [0, -0.25, "side"], [0, 0, "side"]];

function roam(seed: number, sprint: boolean, heightM = ADULT_M, frames = 40000) {
  let s = seed;
  const random = vi.spyOn(Math, "random").mockImplementation(() => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; });
  const walk = new Uint8Array(NX * NX).fill(1);
  for (let j = 0; j < NX; j++) for (let i = 0; i < NX; i++) {
    const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
    if (i < 1 || j < 1 || i >= NX - 1 || j >= NX - 1 || FURNITURE.some(f => Math.abs(cx - f.x) < f.hx + CELL / 2 && Math.abs(cz - f.z) < f.hz + CELL / 2)) walk[j * NX + i] = 0;
  }
  const layout = { origin: [0, 0, 0], e1: [1, 0, 0], up: [0, 1, 0], e2: [0, 0, 1], units_per_meter: 1, nx: NX, ny: NX, cell: CELL, walkable: Array.from(walk, v => (v ? "1" : "0")).join("") };
  const cat = new RoomCat(layout);
  (cat as unknown as { mixer: unknown }).mixer = { update() {} };  // 測試裡沒有讀模型，動作播放器換成空的
  cat.heightM = heightM;
  cat.visible = true;
  cat.blockCells(ITEMS.flatMap(it => footprintCells(layout, it)));
  cat.place(cat.randomCell());
  cat.sprint = cat.roamFar = sprint;
  const rects: Rect[] = [...FURNITURE, ...ITEMS.map(i => ({ x: i.x, z: i.z, hx: i.widthM / 2, hz: i.depthM / 2, kind: "item" as const }))];
  const k = heightM / MODEL_HEIGHT_M;
  const deepest = { nose: 0, side: 0 };
  let walked = 0;
  for (let f = 0; f < frames; f++) {
    if (cat.state === "idle") cat.timer = Math.min(cat.timer, 0.3);  // 不用等牠發呆
    cat.autoIn = 99;
    const before = cat.cat.position.clone();
    cat.update(1 / 30);
    walked += cat.cat.position.distanceTo(before);
    const { x, z } = cat.cat.position, h = cat.heading;
    for (const [bx, bz, part] of BODY) {
      const px = x + (Math.sin(h) * bz + Math.cos(h) * bx) * k, pz = z + (Math.cos(h) * bz - Math.sin(h) * bx) * k;
      for (const r of rects) deepest[part] = Math.max(deepest[part], Math.min(r.hx - Math.abs(px - r.x), r.hz - Math.abs(pz - r.z)));
    }
  }
  random.mockRestore();
  return { ...deepest, walked };
}

// 修正前（2026-11-16 量）：成貓閒晃 鼻尖 10.9 公分、身體 8.6 公分；跑酷 12.4／10.1；幼貓 7.0／6.1。
describe("掃描房間的貓不穿過家具和用品（#354）", () => {
  it("閒晃：身體和鼻尖都不壓進家具或用品（容許 3 公分以內的擦邊）", () => {
    const r = roam(3, false);
    expect(r.walked).toBeGreaterThan(300);  // 真的有在走，不是卡住（修正前約 410 公尺）
    expect(r.side).toBeLessThan(0.03);
    expect(r.nose).toBeLessThan(0.03);
  });
  it("半夜跑酷（衝刺）：窄的地方頂多擦到幾公分", () => {
    const r = roam(5, true);
    expect(r.walked).toBeGreaterThan(1200);  // 修正前約 1780 公尺
    expect(r.side).toBeLessThan(0.04);
    expect(r.nose).toBeLessThan(0.06);
  });
  it("幼貓（比較小）也一樣", () => {
    const r = roam(3, false, 0.22);
    expect(r.walked).toBeGreaterThan(300);
    expect(r.side).toBeLessThan(0.03);
    expect(r.nose).toBeLessThan(0.03);
  });
  it("窄到只剩一格寬的通道還是走得過去（不會因為怕擦到就卡住）", () => {
    // 5 × 2 公尺的房間，中間一道牆只留一格（10 公分）的缺口
    const nx = 50, ny = 20;
    const cells = Array.from({ length: nx * ny }, (_, k) => {
      const i = k % nx, j = (k - i) / nx;
      return i < 1 || j < 1 || i >= nx - 1 || j >= ny - 1 || (i === 25 && j !== 10) ? "0" : "1";
    }).join("");
    const cat = new RoomCat({ origin: [0, 0, 0], e1: [1, 0, 0], up: [0, 1, 0], e2: [0, 0, 1], units_per_meter: 1, nx, ny, cell: CELL, walkable: cells });
    (cat as unknown as { mixer: unknown }).mixer = { update() {} };  // 測試裡沒有讀模型，動作播放器換成空的
    cat.visible = true;
    cat.place(5 * nx + 5);
    const to = 15 * nx + 45;
    expect(cat.goTo(to)).toBe(true);
    for (let f = 0; f < 3000 && cat.state === "walk"; f++) cat.update(1 / 30);
    expect(cat.cat.position.distanceTo({ x: 4.55, y: 0, z: 1.55 })).toBeLessThan(0.06);
  });
});
