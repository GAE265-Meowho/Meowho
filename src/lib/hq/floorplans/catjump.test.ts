// 虛擬體驗（#150）：點床、沙發跳上去，在上面走，點地板跳下來（不需要 WebGL）
import { describe, expect, it } from "vitest";
import { normalizeReading } from "./read";
import { blocked, obstacles } from "./catwalk";
import { jumpReady } from "@/lib/hq/rooms/cat-moves";
import { clampTop, goalForBox, idleAction, MAX_JUMP_M, onTop, stepActor, worldOf, type Actor, type Goal, type World } from "./catjump";
import { houseScene } from "./scene";
import type { PlanRoom } from "./types";

// 臥室 3.2 × 4.0：床頭靠上牆、書桌貼左牆、衣櫃貼右牆、沙發貼下牆
const world = (): World => {
  const r = normalizeReading({
    layoutNotes: "", kind: "photo", name: "臥室", scale: { mPerPx: null, source: "estimate" }, wallHeightM: null,
    walls: [{ ax: 0, ay: 0, bx: 3.2, by: 0, t: .15 }, { ax: 3.2, ay: 0, bx: 3.2, by: 4, t: .15 }, { ax: 3.2, ay: 4, bx: 0, by: 4, t: .15 }, { ax: 0, ay: 4, bx: 0, by: 0, t: .15 }],
    openings: [],
    furniture: [
      { kind: "bed", label: "床", wall: 0, parent: null, x: 1.6, y: 1.0, w: 1.5, d: 2.0, rot: 0 },
      { kind: "desk", label: "書桌", wall: 3, parent: null, x: 0.4, y: 2.6, w: 1.2, d: .6, rot: 0 },
      { kind: "wardrobe", label: "衣櫃", wall: 1, parent: null, x: 3.0, y: 2.3, w: 1.0, d: .6, rot: 0 },
      { kind: "sofa", label: "沙發", wall: 2, parent: null, x: 1.8, y: 3.5, w: 1.8, d: .85, rot: 0 },
    ],
  });
  if (!r.ok) throw new Error(r.error);
  const room: PlanRoom = { id: "r1", name: "臥室", image_path: "x", status: "ready", created_at: "x", ...r.geometry };
  const scene = houseScene([room])[0];
  return worldOf(scene, obstacles(scene));
};
const boxOf = (w: World, kind: string) => w.scene.boxes.findIndex(b => b.furniture === kind);

/** 一直走到 done，最多 n 格；回傳最後狀態與途中最高的 y */
function run(a: Actor, goal: Goal, w: World, n = 900) {
  let maxY = a.y;
  for (let i = 0; i < n; i++) {
    const r = stepActor(a, goal, w, 1 / 30);
    a = r.actor;
    maxY = Math.max(maxY, a.y);
    if (r.done) return { a, maxY, frames: i };
  }
  return { a, maxY, frames: n };
}
const floor = (x: number, z: number): Actor => ({ x, z, y: 0, heading: 0, moving: false, on: null, jump: null });

describe("檯面", () => {
  it("床、書桌、沙發坐墊是檯面；衣櫃太高不算；沙發只算坐墊高度", () => {
    const w = world();
    expect(w.tops.map(s => s.kind).sort()).toEqual(["bed", "desk", "sofa"]);
    expect(w.tops.find(s => s.kind === "bed")!.y).toBe(0.5);
    const sofa = w.tops.find(s => s.kind === "sofa")!;
    expect(sofa.y).toBeCloseTo(0.8 * 0.58);
    expect(w.tops.every(s => s.y <= MAX_JUMP_M)).toBe(true);
  });
  it("床只算棉被那一段：床頭的枕頭比較高，不能站（腳會陷進去）", () => {
    const w = world();
    const bed = w.tops.find(s => s.kind === "bed")!;
    const box = w.scene.boxes[bed.box];
    // 床頭靠上牆（z 小的那一側）：枕頭在床頭往內 0.18～0.58 m
    const headZ = box.z - box.sz / 2;
    expect(onTop(bed, box.x, headZ + 0.4, 0)).toBe(false);   // 枕頭
    expect(onTop(bed, box.x, headZ + 1.2, 0)).toBe(true);    // 棉被
    expect(bed.hz * 2).toBeCloseTo(1.35);
  });

  it("點到家具：可以站的回傳檯面目標（夾在檯面內），衣櫃回 null", () => {
    const w = world();
    const g = goalForBox(w, boxOf(w, "bed"), 1.6, 0.05)!;   // 點在枕頭上：夾到棉被那一段
    expect(w.tops[g.surface!].kind).toBe("bed");
    expect(onTop(w.tops[g.surface!], g.x, g.z)).toBe(true);
    expect(goalForBox(w, boxOf(w, "wardrobe"), 3, 2.3)).toBeNull();
  });
});

describe("跳上去、在上面走、跳下來", () => {
  it("從地板點床：走到床邊、弧線跳上去，落在床上", () => {
    const w = world();
    const bed = w.tops.findIndex(s => s.kind === "bed");
    const goal = goalForBox(w, boxOf(w, "bed"), 1.6, 1.2)!;
    const { a, maxY } = run(floor(1.6, 2.7), goal, w);
    expect(a.on).toBe(bed);
    expect(a.y).toBe(0.5);
    expect(maxY).toBeGreaterThan(0.5);   // 有跳起來的弧線
    expect(onTop(w.tops[bed], a.x, a.z, 0)).toBe(true);
  });
  it("在床上點床的另一頭：在床上走過去，不會走出床面", () => {
    const w = world();
    const bed = w.tops.findIndex(s => s.kind === "bed");
    const start: Actor = { ...floor(0, 0), ...clampTop(w.tops[bed], 1.0, 1.5), y: 0.5, on: bed };
    const goal = goalForBox(w, boxOf(w, "bed"), 2.2, 0.4)!;
    const { a } = run(start, goal, w);
    expect(a.on).toBe(bed);
    expect(Math.hypot(a.x - goal.x, a.z - goal.z)).toBeLessThan(0.1);
  });
  it("在床上點地板：跳到旁邊的地板，再走到目標", () => {
    const w = world();
    const bed = w.tops.findIndex(s => s.kind === "bed");
    const start: Actor = { ...floor(0, 0), ...clampTop(w.tops[bed], 1.6, 1.5), y: 0.5, on: bed };
    let a = start;
    for (let i = 0; i < 900; i++) {
      const r = stepActor(a, { x: 2.0, z: 2.7, surface: null }, w, 1 / 30);
      a = r.actor;
      if (r.done) break;
    }
    expect(a.on).toBeNull();
    expect(a.y).toBe(0);
    expect(blocked(a.x, a.z, w.scene, w.obs)).toBe(false);
    expect(Math.hypot(a.x - 2.0, a.z - 2.7)).toBeLessThan(0.1);
  });
  it("起跳前先原地轉身面向落點，騰空時朝向固定（不會側身往上跳）", () => {
    const w = world();
    const bed = w.tops.findIndex(s => s.kind === "bed");
    const start: Actor = { ...floor(0, 0), ...clampTop(w.tops[bed], 1.6, 1.5), y: 0.5, on: bed, heading: Math.PI };
    let a = start;
    const times = { crouch: 0.4, air: 0.6, land: 0.3 };
    const seen: string[] = [];
    for (let i = 0; i < 900; i++) {
      const before = a;
      a = stepActor(a, { x: 2.0, z: 2.7, surface: null }, w, 1 / 30, times).actor;
      const j = a.jump;
      if (!j) { if (seen.length) break; continue; }
      if (seen.at(-1) !== j.phase) seen.push(j.phase!);
      if (j.phase === "turn" || j.phase === "crouch") expect([a.x, a.z, a.y]).toEqual([before.x, before.z, before.y]);  // 原地
      if (j.phase === "air") expect(jumpReady(a.heading, j.heading!)).toBe(true);
    }
    expect(seen).toEqual(["turn", "crouch", "air", "land"]);
    expect(a.on).toBeNull();
  });
  it("從床跳到沙發：先跳到地板、再跳上沙發", () => {
    const w = world();
    const bed = w.tops.findIndex(s => s.kind === "bed"), sofa = w.tops.findIndex(s => s.kind === "sofa");
    let a: Actor = { ...floor(0, 0), ...clampTop(w.tops[bed], 1.6, 1.8), y: 0.5, on: bed };
    const goal = goalForBox(w, boxOf(w, "sofa"), 1.8, 3.5)!;
    const visited = new Set<number | null>();
    for (let i = 0; i < 1500; i++) {
      const r = stepActor(a, goal, w, 1 / 30);
      a = r.actor;
      if (!a.jump) visited.add(a.on);
      if (r.done) break;
    }
    expect(a.on).toBe(sofa);
    expect(visited.has(null)).toBe(true);   // 中途有落地
  });
});

describe("閒置", () => {
  it("在床或沙發上就睡覺；在地板上就找地方逛", () => {
    const w = world();
    const bed = w.tops.findIndex(s => s.kind === "bed"), desk = w.tops.findIndex(s => s.kind === "desk");
    expect(idleAction({ ...floor(1, 1), y: 0.5, on: bed }, w)).toEqual({ wander: null, sleep: true });
    expect(idleAction({ ...floor(1, 1), y: 0.75, on: desk }, w)).toEqual({ wander: null, sleep: false });
    let k = 0;
    const seq = [0.5, 0.5, 0.3, 0.7];  // 第一個點在床上（擋住），第二個點是空地
    const onFloor = idleAction(floor(1.6, 2.7), w, () => seq[k++ % seq.length]);
    expect(onFloor.sleep).toBe(false);
    expect(onFloor.wander?.surface).toBeNull();
  });
});
