// 虛擬體驗（#150）：貓在房間裡走路的規則（不需要 WebGL）
import { describe, expect, it } from "vitest";
import { floorplanRoomSchema } from "@/lib/ai/schemas";
import living from "./fixtures/living-room.json";
import { normalizeReading } from "./read";
import { blocked, CAT_RADIUS_M, freeSpot, headingTo, obstacles, stepCat, wanderSpot, type CatState } from "./catwalk";
import { colliders, houseScene } from "./scene";
import type { PlanRoom } from "./types";

// 客廳 4.2 × 3.6：沙發貼下牆（中心 1.5, 3.065，寬 2.1 深 0.9）、電視櫃貼上牆、單椅在 (3.6, 2.0)
const scene = () => {
  const r = normalizeReading(floorplanRoomSchema.parse(structuredClone(living)));
  if (!r.ok) throw new Error(r.error);
  const room: PlanRoom = { id: "r1", name: "客廳", image_path: "x", status: "ready", created_at: "x", ...r.geometry };
  return houseScene([room])[0];
};

describe("障礙與可站位置", () => {
  it("牆、家具擋路；門楣在頭上不擋路；走出房間也算擋住", () => {
    const s = scene();
    const obs = obstacles(s);
    expect(obs.length).toBeGreaterThan(0);
    // 門楣在頭上：障礙數＝碰撞體數－門楣數
    expect(obs).toHaveLength(colliders(s).length - s.boxes.filter(b => b.kind === "lintel").length);
    expect(blocked(1.5, 3.065, s, obs)).toBe(true);        // 沙發上
    expect(blocked(2.1, 1.8, s, obs)).toBe(false);         // 房間中間
    expect(blocked(0.05, 1.8, s, obs)).toBe(true);         // 貼到牆
    expect(blocked(-1, 1.8, s, obs)).toBe(true);           // 房間外
  });
  it("轉 90 度的家具用轉過的範圍判斷", () => {
    const s = scene();
    const obs = [{ x: 2, z: 2, hx: 1, hz: 0.2, rotY: Math.PI / 2 }];
    expect(blocked(2, 2.9, s, obs, 0)).toBe(true);   // 長邊轉成沿 z
    expect(blocked(2.9, 2, s, obs, 0)).toBe(false);
  });
  it("起點：房間中心可站就用中心，否則找離中心最近的空位（固定，不隨機）", () => {
    const s = scene();
    expect(freeSpot(s, obstacles(s))).toEqual({ x: 2.1, z: 1.8 });
    const full = [{ x: 2.1, z: 1.8, hx: 0.5, hz: 0.5, rotY: 0 }];
    const spot = freeSpot(s, full)!;
    expect(blocked(spot.x, spot.z, s, full)).toBe(false);
    expect(freeSpot(s, full)).toEqual(spot);
    expect(Math.hypot(spot.x - 2.1, spot.z - 1.8)).toBeLessThan(0.5 + 0.2 + 0.15);
    expect(freeSpot(s, [{ x: 2.1, z: 1.8, hx: 9, hz: 9, rotY: 0 }])).toBeNull();
  });
  it("閒置亂逛：隨機找可站的位置，不一定是中心", () => {
    const s = scene(), obs = obstacles(s);
    let i = 0;
    const seq = [0.9, 0.9, 0.2, 0.2];
    const spot = wanderSpot(s, obs, () => seq[i++ % seq.length])!;
    expect(blocked(spot.x, spot.z, s, obs)).toBe(false);
    expect(spot).not.toEqual({ x: 2.1, z: 1.8 });
  });
});

describe("stepCat", () => {
  const start: CatState = { x: 2.1, z: 1.8, heading: headingTo(1, 0), moving: false };
  it("朝目標前進、到達後停下", () => {
    const s = scene(), obs = obstacles(s);
    let cat = start;
    for (let i = 0; i < 200; i++) cat = stepCat(cat, { x: 3.0, z: 1.8 }, s, obs, 1 / 30);
    expect(Math.abs(cat.x - 3.0)).toBeLessThan(0.07);
    expect(cat.moving).toBe(false);
  });
  it("方向差太多時先原地轉身", () => {
    const s = scene();
    const next = stepCat(start, { x: 1.0, z: 1.8 }, s, obstacles(s), 1 / 30);
    expect([next.x, next.z]).toEqual([start.x, start.z]);
    expect(next.moving).toBe(true);
  });
  it("前方是家具就停在旁邊，不會穿過去", () => {
    const s = scene(), obs = obstacles(s);
    let cat: CatState = { x: 1.5, z: 1.8, heading: 0, moving: false };
    for (let i = 0; i < 300; i++) cat = stepCat(cat, { x: 1.5, z: 3.065 }, s, obs, 1 / 30);
    expect(cat.moving).toBe(false);
    expect(cat.z).toBeLessThan(3.065 - 0.45 - CAT_RADIUS_M + 0.05);
  });
  it("斜著撞到家具：沿著邊滑過去，最後停在最接近的地方", () => {
    const s = scene(), obs = obstacles(s);
    // 從沙發左上方往沙發中間斜走：會滑到沙發上緣，但不會進到沙發裡
    let cat: CatState = { x: 0.6, z: 1.8, heading: headingTo(1, 1.2), moving: false };
    for (let i = 0; i < 400; i++) cat = stepCat(cat, { x: 1.5, z: 3.0 }, s, obs, 1 / 30);
    expect(cat.moving).toBe(false);
    expect(blocked(cat.x, cat.z, s, obs)).toBe(false);
    expect(cat.x).toBeGreaterThan(1.2);                    // 有往右滑
    expect(cat.z).toBeGreaterThan(2.3);                    // 貼近沙發上緣
  });

  it("沒有目標：不動", () => {
    const s = scene();
    expect(stepCat({ ...start, moving: true }, null, s, obstacles(s), 0.1)).toEqual(start);
  });
});
