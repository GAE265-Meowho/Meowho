// @vitest-environment node
// 出外出籠的位置要能站（渝茜 2026-11-16：第 1 天之後貓卡在外出籠後面，逗貓時不追玩具、也看不到）
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/play/audio-player", () => ({ playSfx: () => {} }));
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomCat } from "./cat";

(globalThis as { self?: unknown }).self ??= globalThis;
const load = (f: string) => new Promise<unknown>((ok, bad) => {
  const b = readFileSync(f);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "", ok, bad);
});

const NX = 40, CELL = 0.1;
function room() {
  const walk = new Uint8Array(NX * NX).fill(1);
  for (let j = 0; j < NX; j++) for (let i = 0; i < NX; i++) if (i < 2 || j < 2 || i >= NX - 2 || j >= NX - 2) walk[j * NX + i] = 0;
  return { origin: [0, 0, 0], e1: [1, 0, 0], up: [0, 1, 0], e2: [0, 0, 1], units_per_meter: 1, nx: NX, ny: NX, cell: CELL, walkable: Array.from(walk, v => (v ? "1" : "0")).join("") };
}

describe("出外出籠", () => {
  it("籠門朝著牆（出口算到牆裡）：出來後站在最近能走的地板上，不卡在牆裡或籠子後面", async () => {
    const gltf = await load("public/hq-cat-models/base/base_clips_kitten.glb");
    const cat = new RoomCat(room()) as unknown as RoomCat & Record<string, any>;
    cat.useModel({ gltf, albedo: null }, 0.2);
    cat.place(cat.randomCell());
    // 外出籠貼著 z＝3.8 那面牆，門朝 +z（朝牆）：出口在牆外
    const carrier = { x: 2, z: 3.55, widthM: 0.33, depthM: 0.5, heightM: 0.31, rotY: 0 };
    expect(cat.tuck(carrier)).toBe(true);
    cat.untuck();
    const p = cat.cat.position;
    expect(cat.canStand(p.x, p.z)).toBe(true);
    expect(Math.hypot(p.x - 2, p.z - 3.55)).toBeLessThan(1);  // 還在籠子附近
  }, 60000);
});
