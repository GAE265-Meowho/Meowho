#!/usr/bin/env node
// 產生一間合成的「3D 掃描房間」給沙盒測試 RoomViewer（#354 白天／夜晚光）。沒有真的掃描檔時用。
// 輸出到 public/_test-room/（已在 .gitignore，不要提交產生的檔）：scene.splat、scene.json、scene.layout.json、scene.cameras.json。
// 用法：node scripts/make-test-splat.mjs [輸出資料夾]
//   之後 NEXT_PUBLIC_ROOM_DEMO_BASE=http://localhost:<埠>/_test-room npx next dev -p <埠>，打開 /cats/demo/play?quick=1。
// 房間 4×4 公尺、高 2.5 公尺：地板、三面牆（前面開著給鏡頭看）、床、櫃子、地毯幾個色塊，約 5 萬個點。
// 座標：檢視器座標＝地板座標（公尺），y 向上，units_per_meter＝1。
// .splat 格式（antimatter15）：每點 32 bytes＝位置 3×float32、尺度 3×float32、RGBA 4×uint8、旋轉四元數 4×uint8（q×128＋128）。
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "public/_test-room");
const W = 4, D = 4, H = 2.5;  // 房間寬（x）、深（z）、高
const STEP = 0.035;           // 點的間距（公尺）
const pts = [];
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jit = (c, n = 14) => Math.max(0, Math.min(255, Math.round(c + (rand() - 0.5) * n)));

/** 在一個矩形面上撒點：o 起點，u、v 兩個邊向量，color [r,g,b] 或 (s,t)=>[r,g,b] */
function plane(o, u, v, color) {
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  const nu = Math.max(1, Math.round(lu / STEP)), nv = Math.max(1, Math.round(lv / STEP));
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const s = i / nu, t = j / nv;
    const c = typeof color === "function" ? color(s, t) : color;
    pts.push({ p: [0, 1, 2].map(k => o[k] + u[k] * s + v[k] * t), c: c.map(x => jit(x)) });
  }
}

/** 一個長方體的五個面（底面不畫）：中心 cx、cz，底在 y0，尺寸 sx、sy、sz */
function box(cx, y0, cz, sx, sy, sz, color) {
  const x0 = cx - sx / 2, z0 = cz - sz / 2, y1 = y0 + sy;
  const dark = color.map(c => c * 0.8);
  plane([x0, y1, z0], [sx, 0, 0], [0, 0, sz], color);
  plane([x0, y0, z0], [sx, 0, 0], [0, sy, 0], dark);
  plane([x0, y0, z0 + sz], [sx, 0, 0], [0, sy, 0], dark);
  plane([x0, y0, z0], [0, 0, sz], [0, sy, 0], dark);
  plane([x0 + sx, y0, z0], [0, 0, sz], [0, sy, 0], dark);
}

// 地板：木紋（沿 x 的木條）
plane([0, 0, 0], [W, 0, 0], [0, 0, D], (s, t) => {
  const plank = Math.floor(t * D / 0.2) % 2;
  return plank ? [176, 132, 92] : [160, 118, 80];
});
// 三面牆：後（z=0）、左（x=0）、右（x=W）；前面（z=D）不畫，鏡頭從那邊看
plane([0, 0, 0], [W, 0, 0], [0, H, 0], [236, 228, 212]);
plane([0, 0, 0], [0, 0, D], [0, H, 0], [226, 222, 206]);
plane([W, 0, 0], [0, 0, D], [0, H, 0], [226, 222, 206]);
// 後牆上的窗（淡藍色塊）
plane([1.4, 1.1, 0.01], [1.2, 0, 0], [0, 0.8, 0], [170, 205, 232]);
// 家具：床（白被子＋木框）、櫃子、地毯
box(0.95, 0, 1.1, 1.5, 0.45, 2.0, [242, 240, 234]);
box(3.4, 0, 0.4, 0.9, 0.9, 0.5, [120, 92, 70]);
plane([1.9, 0.005, 2.2], [1.4, 0, 0], [0, 0, 1.0], [196, 86, 70]);

const buf = Buffer.alloc(pts.length * 32);
pts.forEach(({ p, c }, i) => {
  const o = i * 32;
  p.forEach((v, k) => buf.writeFloatLE(v, o + k * 4));
  for (let k = 0; k < 3; k++) buf.writeFloatLE(STEP * 0.7, o + 12 + k * 4);
  c.forEach((v, k) => buf.writeUInt8(v, o + 24 + k));
  buf.writeUInt8(255, o + 27);
  [255, 128, 128, 128].forEach((v, k) => buf.writeUInt8(v, o + 28 + k));  // 單位四元數（w＝1）
});

// 物品（地板座標）：床可以跳上去，櫃子可以跳上去
const obj = (id, label, name_zh, center, size, jump) => ({
  id, label, name_zh, box: { center, size, yaw: 0 },
  affordance: { jump_on: jump, hide_under: false, push: false, play: false },
  physics: { body: "fixed", surface: "wood" }, surfaces: jump ? [{ kind: "top", top_y: size[1] }] : [],
});
const frame = { origin: [0, 0, 0], e1: [1, 0, 0], up: [0, 1, 0], e2: [0, 0, 1], units_per_meter: 1 };
const scene = {
  frame,
  room: { min: [0, 0], max: [W, D] },
  assets: { room: "scene.splat" },
  objects: [
    obj("bed", "bed", "床", [0.95, 0.225, 1.1], [1.5, 0.45, 2.0], true),
    obj("cabinet", "cabinet", "櫃子", [3.4, 0.45, 0.4], [0.9, 0.9, 0.5], true),
  ],
};
// 可走格子：10 公分一格，床、櫃子、牆邊 10 公分不能走
const cell = 0.1, nx = Math.round(W / cell), ny = Math.round(D / cell);
const blockedAt = (x, z) => x < 0.1 || z < 0.1 || x > W - 0.1 || z > D - 0.1
  || scene.objects.some(o => Math.abs(x - o.box.center[0]) < o.box.size[0] / 2 + 0.05 && Math.abs(z - o.box.center[2]) < o.box.size[2] / 2 + 0.05);
let walkable = "";
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) walkable += blockedAt((i + 0.5) * cell, (j + 0.5) * cell) ? "0" : "1";
const layout = { ...frame, nx, ny, cell, walkable };
// 拍攝點：沿著房間前面（z＝3.9）走一排，高 1.8 公尺，往後牆略往下看。旋轉矩陣是 camToWorld，三欄＝右、下、前
const cameras = Array.from({ length: 7 }, (_, i) => {
  const x = 0.8 + i * 0.4;
  const f = [0, -0.6, -1], n = Math.hypot(...f), fw = f.map(v => v / n);
  const right = [1, 0, 0];
  const down = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]].map(v => -v);
  return { img_name: `frame_${String(i).padStart(4, "0")}.jpg`, position: [x, 1.8, 3.9], rotation: [0, 1, 2].map(r => [right[r], down[r], fw[r]]) };
});

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "scene.splat"), buf);
writeFileSync(join(out, "scene.json"), JSON.stringify(scene));
writeFileSync(join(out, "scene.layout.json"), JSON.stringify(layout));
writeFileSync(join(out, "scene.cameras.json"), JSON.stringify(cameras));
console.log(`寫入 ${out}：${pts.length} 個點（${(buf.length / 1e6).toFixed(1)} MB）`);
