// 平面圖 → 3D 娃娃屋場景資料（#138 步驟 4）：用固定 JSON 讀出的格局測試，不需要 WebGL
import { describe, expect, it } from "vitest";
import { floorplanRoomSchema } from "@/lib/ai/schemas";
import living from "./fixtures/living-room.json";
import { normalizeReading } from "./read";
import { colliders, focusScenes, houseScene, ROOM_GAP_M, roomBoxes, sceneBounds } from "./scene";
import type { PlanGeometry, PlanRoom } from "./types";

const geo = (): PlanGeometry => {
  const r = normalizeReading(floorplanRoomSchema.parse(structuredClone(living)));
  if (!r.ok) throw new Error(r.error);
  return r.geometry;
};
const room = (id: string, g: PlanGeometry | null, status: PlanRoom["status"] = "ready"): PlanRoom =>
  ({ id, name: `房間${id}`, image_path: "x", status, created_at: "x", ...(g ?? {}) });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("roomBoxes", () => {
  it("地板是房間外框；無天花板；家具高度與可跳上標記照讀圖結果", () => {
    const { boxes, size } = roomBoxes(geo());
    expect(size).toEqual([4.2, 3.6]);
    expect(boxes[0]).toMatchObject({ kind: "floor", x: 2.1, z: 1.8, sx: 4.2, sz: 3.6 });
    const sofa = boxes.find(b => b.furniture === "sofa")!;
    expect(sofa).toMatchObject({ x: 1.5, y: 0.4, z: 3.065, sx: 2.1, sy: 0.8, sz: 0.9, walkable: true });
    expect(Math.abs(sofa.rotY)).toBeCloseTo(Math.PI);
    expect(boxes.find(b => b.furniture === "chair")?.walkable).toBeUndefined();
  });

  it("門：牆斷開，門上方留門楣；牆兩端各延伸半個牆厚，轉角不留縫", () => {
    const top = roomBoxes(geo()).boxes.filter(b => b.z === 0 && b.kind !== "floor" && b.kind !== "furniture");
    // 4.2 長的牆，門在 1.2～2.1：左段＋門楣＋右段
    expect(top.map(b => b.kind)).toEqual(["wall", "lintel", "wall"]);
    expect(sum(top.filter(b => b.kind === "wall").map(b => b.sx)) + 0.9).toBeCloseTo(4.2 + 0.15);
    const lintel = top[1];
    expect(lintel).toMatchObject({ sx: 0.9, sy: 0.7, y: 2.45 });  // 牆高 2.8、門高 2.1
    expect(top[0].x).toBeCloseTo((1.2 + 0.075) / 2 - 0.075);
  });

  it("窗：窗台＋半透明玻璃＋窗楣，貼在牆上", () => {
    const right = roomBoxes(geo()).boxes.filter(b => b.x === 4.2 && b.kind !== "floor");
    expect(right.map(b => b.kind)).toEqual(["wall", "sill", "glass", "lintel", "wall"]);
    const [, sill, glass, lintel] = right;
    expect(sill).toMatchObject({ y: 0.45, sy: 0.9 });
    expect(glass).toMatchObject({ y: 1.5, sy: 1.2, sz: 0.02 });
    expect(lintel.y).toBeCloseTo(2.45);
    expect(Math.abs(sill.rotY)).toBeCloseTo(Math.PI / 2);  // 垂直的牆轉 90°
  });

  it("牆的朝外方向指離房間中心（畫面用來把面向鏡頭的牆降低）", () => {
    const walls = roomBoxes(geo()).boxes.filter(b => b.kind === "wall");
    const outOf = (pred: (b: (typeof walls)[number]) => boolean) => walls.find(pred)?.out;
    expect(outOf(b => b.z === 0)).toEqual([0, -1]);
    expect(outOf(b => b.x === 4.2)).toEqual([1, 0]);
    expect(outOf(b => b.z === 3.6)).toEqual([0, 1]);
    expect(outOf(b => b.x === 0)).toEqual([-1, 0]);
  });

  it("重疊或超出牆長的開口不產生負長度的方塊", () => {
    const g = geo();
    g.openings = [{ kind: "door", wall: 0, at: 1, w: 1, h: 2.1 }, { kind: "door", wall: 0, at: 1.5, w: 1, h: 2.1 }, { kind: "door", wall: 0, at: 4, w: 2, h: 2.1 }];
    expect(roomBoxes(g).boxes.every(b => b.sx > 0 && b.sy > 0 && b.sz > 0)).toBe(true);
  });

  it("房間不在原點時平移到左上角＝原點", () => {
    const g = geo();
    g.walls = g.walls.map(w => ({ ...w, a: [w.a[0] + 5, w.a[1] + 2] as [number, number], b: [w.b[0] + 5, w.b[1] + 2] as [number, number] }));
    g.furniture = g.furniture.map(f => ({ ...f, x: f.x + 5, y: f.y + 2 }));
    expect(roomBoxes(g).boxes.find(b => b.furniture === "sofa")).toMatchObject({ x: 1.5, z: 3.065 });
  });
});

describe("houseScene（Q10：不拼接，並排）", () => {
  it("只放讀圖完成的房間，由左到右並排、中間留走道；外框給鏡頭取景", () => {
    const scenes = houseScene([room("r1", geo()), room("r2", null, "reading"), room("r3", geo())]);
    expect(scenes.map(s => [s.id, s.offset])).toEqual([["r1", [0, 0]], ["r3", [4.2 + ROOM_GAP_M, 0]]]);
    expect(sceneBounds(scenes)).toEqual({ width: 4.2 * 2 + ROOM_GAP_M, depth: 3.6, height: 2.8 });
    expect(sceneBounds([])).toEqual({ width: 0, depth: 0, height: 0 });
  });
  it("碰撞體：牆、門楣、窗台、家具；不含玻璃與地板", () => {
    const kinds = new Set(colliders(houseScene([room("r1", geo())])[0]).map(b => b.kind));
    expect([...kinds].sort()).toEqual(["furniture", "lintel", "sill", "wall"]);
  });
  it("切換單間：只留那一間並移到原點；全部或找不到時整戶並排", () => {
    const scenes = houseScene([room("r1", geo()), room("r2", geo())]);
    expect(focusScenes(scenes, "r2").map(s => [s.id, s.offset])).toEqual([["r2", [0, 0]]]);
    expect(focusScenes(scenes, null)).toBe(scenes);
    expect(focusScenes(scenes, "r9")).toBe(scenes);
  });
});
