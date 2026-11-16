// 穿模檢查（#354 第 2 份附帶）：不開畫面，讓娃娃屋的貓在示範房間（子哲的家，放好四件用品）裡自己逛、照劇情走去躲、跳上床、走到碗邊，
// 每一格量貓的身體（鼻尖、肩、腰、臀）壓進落地家具或用品多深。貓放大 CAT_SCALE 倍；跳躍和站在檯面上的那幾格不算。
import { describe, expect, it } from "vitest";
import { DEMO_DOLLHOUSE } from "@/lib/play/room";
import { goalFor, itemSpots, type PlacedSpot } from "@/lib/play/stage";
import { CAT_SCALE, obstacles, type Obstacle } from "./catwalk";
import { idleAction, stepActor, worldOf, type Actor, type Goal } from "./catjump";
import { houseScene } from "./scene";

/** 母體站姿量到的身體輪廓（公尺，x 向左、z 向前），不含尾巴 */
const BODY: [number, number, "nose" | "side"][] = [[0, 0.245, "nose"], [0.085, 0.15, "side"], [-0.085, 0.15, "side"], [0.1, 0, "side"], [-0.1, 0, "side"], [0.085, -0.2, "side"], [-0.085, -0.2, "side"], [0, -0.25, "side"]];
const SIZES = { bowl: { widthM: 0.45, depthM: 0.25 }, litter_box: { widthM: 0.5, depthM: 0.4 }, carrier: { widthM: 0.5, depthM: 0.32 }, scratcher: { widthM: 0.4, depthM: 0.4 } };
const ACTIONS = ["eat", "litter", "explore", "hide", "high", "sofa"] as const;

function depth(px: number, pz: number, o: Obstacle) {
  const dx = px - o.x, dz = pz - o.z, c = Math.cos(o.rotY), s = Math.sin(o.rotY);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.min(o.hx - Math.abs(lx), o.hz - Math.abs(lz));
}

function roam(seed: number, frames = 60000) {
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const scene = houseScene([DEMO_DOLLHOUSE])[0];
  const names: Record<number, string> = {};
  scene.boxes.forEach(b => { if (b.furnitureIndex != null) names[b.furnitureIndex] = b.furniture ?? "家具"; });
  const placed: PlacedSpot[] = [];
  for (const [id, size] of Object.entries(SIZES)) {
    const spots = itemSpots(scene, size, placed, names);
    const sp = spots[placed.length % spots.length];
    if (sp) placed.push({ id, ...size, x: sp.x, z: sp.z });
  }
  const items: Obstacle[] = placed.map(i => ({ x: i.x, z: i.z, hx: i.widthM / 2, hz: i.depthM / 2, rotY: 0 }));
  const furniture = obstacles(scene);
  const w = worldOf(scene, [...furniture, ...items]);
  let a: Actor = { x: scene.size[0] / 2, z: scene.size[1] / 2, y: 0, heading: 0, moving: false, on: null, jump: null };
  let goal: Goal | null = null, idle = 0, walked = 0, story = 0, reached = 0;
  const deepest = { nose: 0, side: 0 };
  for (let f = 0; f < frames; f++) {
    const before = a;
    const r = stepActor(a, goal, w, 1 / 30);
    a = r.actor;
    walked += Math.hypot(a.x - before.x, a.z - before.z);
    if (r.done) { if (goal && Math.hypot(goal.x - a.x, goal.z - a.z) < 0.1) reached++; goal = null; }
    if (!goal && (idle += 1 / 30) > 1) {
      idle = 0;
      if (rand() < 0.4) {
        const g = goalFor(scene, ACTIONS[Math.floor(rand() * ACTIONS.length)], { hide: "床", high: "櫃子", sofa: "床" }, placed);
        const top = g?.box != null ? w.tops.findIndex(t => t.box === g.box) : -1;
        goal = g ? { x: g.x, z: g.z, surface: g.box != null && top >= 0 ? top : null } : null;
        if (goal) story++;
      } else goal = idleAction(a, w, rand).wander;
      if (!goal && a.on !== null) goal = { x: scene.size[0] / 2, z: scene.size[1] / 2, surface: null };
    }
    if (a.on !== null || a.jump) continue;
    for (const [bx, bz, part] of BODY) {
      const px = a.x + (Math.sin(a.heading) * bz + Math.cos(a.heading) * bx) * CAT_SCALE;
      const pz = a.z + (Math.cos(a.heading) * bz - Math.sin(a.heading) * bx) * CAT_SCALE;
      for (const o of [...furniture, ...items]) deepest[part] = Math.max(deepest[part], depth(px, pz, o));
    }
  }
  return { ...deepest, walked, story, reached };
}

describe("娃娃屋的貓不穿過家具和用品（#354）", () => {
// 修正前（2026-11-16 量，碰撞半徑 0.2）：鼻尖 9.4 公分、身體 9.8 公分。
  it("閒逛和走劇情目標：身體和鼻尖都不壓進家具或用品（容許 3 公分以內的擦邊）", () => {
    const r = roam(7);
    expect(r.walked).toBeGreaterThan(300);  // 真的有在走，不是卡住（修正後約 400 公尺）
    expect(r.reached / r.story).toBeGreaterThan(0.7);  // 劇情目標大多走得到（修正前約 75%、修正後約 86%）
    expect(r.side).toBeLessThan(0.03);
    expect(r.nose).toBeLessThan(0.03);
  });
});
