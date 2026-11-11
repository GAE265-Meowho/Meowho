// 虛擬飼養：把外出籠、餐碗、貓砂盆放進 3D 掃描房間。位置算在地板座標（公尺），純函式。
import { describe, expect, it } from "vitest";
import type { RoomLayout, RoomScene } from "@/lib/hq/rooms/demo";
import { footprintCells, nearLabel, placeScanItems, type SceneItem } from "./scene-items";

// 4 × 4 公尺的房間，格子 0.1 公尺（units_per_meter = 1，cell = 0.1）；中間有一張 1 × 1 的床，所在格子不能走
const N = 40;
const walkable = Array.from({ length: N * N }, (_, k) => {
  const i = k % N, j = Math.floor(k / N);
  return i >= 15 && i < 25 && j >= 15 && j < 25 ? "0" : "1";
}).join("");
const layout = { cell: 0.1, nx: N, ny: N, walkable, units_per_meter: 1 } as unknown as RoomLayout;
const obj = (label: string, name_zh: string, cx: number, cz: number, w: number, d: number) => ({
  id: label, label, name_zh, box: { center: [cx, 0.25, cz], size: [w, 0.5, d], yaw: 0 },
  affordance: { jump_on: true, hide_under: false, push: false, play: false }, physics: { body: "fixed", surface: "wood" },
});
const scene = { room: { min: [0, 0], max: [4, 4] }, objects: [obj("bed", "床", 2, 2, 1, 1), obj("desk", "書桌", 0.6, 3.2, 1, 0.6)] } as unknown as RoomScene;
const item = (id: string, near: string | null, w = 0.3, d = 0.4): SceneItem => ({ id, url: `/${id}.glb`, widthM: w, depthM: d, heightM: 0.3, near });

const onFloor = (x: number, z: number) => walkable[Math.floor(z / 0.1) * N + Math.floor(x / 0.1)] === "1";

describe("nearLabel", () => {
  it("「床旁」→ 床；「房間角落」或沒選 → null", () => {
    expect(nearLabel("床旁")).toBe("床");
    expect(nearLabel("書桌旁")).toBe("書桌");
    expect(nearLabel("房間角落")).toBeNull();
    expect(nearLabel(undefined)).toBeNull();
  });
});

describe("placeScanItems", () => {
  it("放在指定物品旁邊：在房間裡、在能走的地板上、不壓到那件物品", () => {
    const [p] = placeScanItems(scene, layout, [item("carrier", "床")]);
    expect(p.id).toBe("carrier");
    expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(4);
    expect(p.z).toBeGreaterThan(0); expect(p.z).toBeLessThan(4);
    expect(onFloor(p.x, p.z)).toBe(true);
    // 離床中心夠遠（床半邊 0.5 ＋ 用品半邊）
    expect(Math.max(Math.abs(p.x - 2), Math.abs(p.z - 2))).toBeGreaterThanOrEqual(0.5 + 0.15);
  });
  it("同一件物品旁放多個用品時彼此不重疊", () => {
    const out = placeScanItems(scene, layout, [item("carrier", "床"), item("bowl", "床", 0.5, 0.3), item("litter_box", "床", 0.35, 0.5)]);
    expect(out).toHaveLength(3);
    for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) {
      const A = out[a], B = out[b];
      const wa = [0.3, 0.5, 0.35][a] / 2 + [0.4, 0.3, 0.5][a] / 2, wb = [0.3, 0.5, 0.35][b] / 2 + [0.4, 0.3, 0.5][b] / 2;
      expect(Math.hypot(A.x - B.x, A.z - B.z)).toBeGreaterThan((wa + wb) / 2 * 0.5);
    }
  });
  it("房間角落（沒指定物品）：放在房間邊緣附近、能走的地板上", () => {
    const [p] = placeScanItems(scene, layout, [item("litter_box", null)]);
    expect(onFloor(p.x, p.z)).toBe(true);
    const edge = Math.min(p.x, 4 - p.x, p.z, 4 - p.z);
    expect(edge).toBeLessThan(0.6);
  });
  it("找不到那件物品時當成房間角落，不會丟錯", () => {
    const [p] = placeScanItems(scene, layout, [item("bowl", "不存在的東西")]);
    expect(onFloor(p.x, p.z)).toBe(true);
  });
  it("用英文 label 也能找到物品", () => {
    const [p] = placeScanItems(scene, layout, [item("bowl", "desk")]);
    expect(Math.hypot(p.x - 0.6, p.z - 3.2)).toBeLessThan(1.5);
  });
});

describe("footprintCells（用品佔的格子，貓不能穿過）", () => {
  it("涵蓋用品的長寬（含一點邊距），不超出房間格子", () => {
    const cells = footprintCells(layout, { x: 1, z: 1, widthM: 0.3, depthM: 0.5 });
    const at = (x: number, z: number) => Math.floor(z / 0.1) * N + Math.floor(x / 0.1);
    expect(cells).toContain(at(1, 1));
    expect(cells).toContain(at(0.86, 0.76));  // 用品邊緣 0.85、0.75 之內
    expect(cells).not.toContain(at(1.5, 1));
    expect(new Set(cells).size).toBe(cells.length);
  });
  it("貼著房間邊的用品只回傳房間內的格子", () => {
    const cells = footprintCells(layout, { x: 0.05, z: 0.05, widthM: 0.4, depthM: 0.4 });
    expect(cells.every(k => k >= 0 && k < N * N)).toBe(true);
  });
});

describe("用品不穿過家具", () => {
  it("地板格子標成能走、但有家具箱子的地方，也不會放上去", () => {
    // 全部能走的房間，中間一張 1 × 1 的沙發（高 0.5）
    const open = { ...layout, walkable: "1".repeat(N * N) } as unknown as RoomLayout;
    const sc = { room: { min: [0, 0], max: [4, 4] }, objects: [obj("sofa", "沙發", 2, 2, 1, 1)] } as unknown as RoomScene;
    const [p] = placeScanItems(sc, open, [item("litter_box", "沙發", 0.34, 0.5)]);
    expect(Math.max(Math.abs(p.x - 2), Math.abs(p.z - 2))).toBeGreaterThanOrEqual(0.5 + 0.17);
    // 角落也一樣：不會跑進沙發裡
    const [q] = placeScanItems(sc, open, [item("bowl", null, 0.5, 0.3)]);
    expect(Math.max(Math.abs(q.x - 2), Math.abs(q.z - 2))).toBeGreaterThan(0.5);
  });
});
