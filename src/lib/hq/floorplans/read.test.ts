// 平面圖讀圖結果整理與檢查（#138，規格 §4.2、§5）：用固定 JSON（fixtures/living-room.json）測試，不連 AI
import { describe, expect, it } from "vitest";
import { floorplanRoomSchema, type FloorplanRoomOut } from "@/lib/ai/schemas";
import living from "./fixtures/living-room.json";
import { DEFAULT_WALL_HEIGHT_M, normalizeReading, snapToWall } from "./read";

const fixture = () => floorplanRoomSchema.parse(structuredClone(living)) as FloorplanRoomOut;
const with_ = (patch: Partial<FloorplanRoomOut>) => ({ ...fixture(), ...patch });
const square = (side: number) => [
  { ax: 0, ay: 0, bx: side, by: 0, t: null }, { ax: side, ay: 0, bx: side, by: side, t: null },
  { ax: side, ay: side, bx: 0, by: side, t: null }, { ax: 0, ay: side, bx: 0, by: 0, t: null },
];

describe("normalizeReading", () => {
  it("固定 JSON：符合 schema，整理成 meta 的格式（牆用 a／b 端點、預設牆高、門窗高度、可跳上的家具）", () => {
    const r = normalizeReading(fixture());
    if (!r.ok) throw new Error(r.error);
    expect(r.name).toBe("客廳");
    expect(r.geometry.scale).toEqual({ m_per_px: 0.012, source: "label" });
    expect(r.geometry.wall_height_m).toBe(DEFAULT_WALL_HEIGHT_M);
    expect(r.geometry.walls[0]).toEqual({ a: [0, 0], b: [4.2, 0], t: 0.15 });
    expect(r.geometry.walls[2].t).toBe(0.15);  // 沒讀到牆厚用預設
    expect(r.geometry.openings).toEqual([
      { kind: "door", wall: 0, at: 1.2, w: 0.9, h: 2.1 },
      { kind: "window", wall: 1, at: 0.8, w: 1.5, h: 1.2, sill: 0.9 },
    ]);
    // 沙發背靠牆 2（下方 y=3.6）：貼齊牆內側（3.6 − 半牆厚 − 半個深度 − 1 公分），背面朝牆＝轉 180 度
    expect(r.geometry.furniture[0]).toEqual({ kind: "sofa", label: "沙發", x: 1.5, y: 3.065, w: 2.1, d: 0.9, h: 0.8, rot: 180, wall: 2, surface: "walkable" });
    expect(r.geometry.furniture[2].surface).toBeUndefined();  // 椅子不標可跳上
  });

  it("不是平面圖也不是室內照片：失敗並說明", () => {
    expect(normalizeReading(with_({ kind: "other" }))).toEqual({ ok: false, error: "看起來不是平面圖或室內照片，請換一張" });
  });

  it("實景照片（#144）：照樣整理，標記來源，比例一律記為推估", () => {
    const r = normalizeReading(with_({ kind: "photo" }));
    expect(r.ok && r.geometry.input).toBe("photo");
    expect(r.ok && r.geometry.scale).toEqual({ m_per_px: null, source: "estimate" });
    expect(r.ok && r.geometry.walls).toHaveLength(4);
    const plan = normalizeReading(fixture());
    expect(plan.ok && plan.geometry.input).toBe("floorplan");
  });

  it("牆少於 3 面、沒圍成封閉：失敗", () => {
    expect(normalizeReading(with_({ walls: square(4).slice(0, 2) })).ok).toBe(false);
    const open = square(4).slice(0, 3);
    expect(normalizeReading(with_({ walls: open, openings: [], furniture: [] }))).toMatchObject({ ok: false, error: expect.stringContaining("封閉") });
  });

  it("房間單邊小於 1 公尺或大於 20 公尺：失敗（多半是比例尺讀錯）", () => {
    expect(normalizeReading(with_({ walls: square(0.5), openings: [], furniture: [] }))).toMatchObject({ ok: false, error: expect.stringContaining("大小不合理") });
    expect(normalizeReading(with_({ walls: square(25), openings: [], furniture: [] })).ok).toBe(false);
    expect(normalizeReading(with_({ walls: square(20), openings: [], furniture: [] })).ok).toBe(true);
  });

  it("門窗：牆索引不存在就丟掉；超出牆長截掉，截完太窄丟掉", () => {
    const r = normalizeReading(with_({ openings: [
      { kind: "door", wall: 9, at: 0, w: 0.9 },
      { kind: "door", wall: 0, at: 3.6, w: 0.9 },   // 4.2 長的牆，只剩 0.6
      { kind: "window", wall: 0, at: 4.0, w: 1 },   // 只剩 0.2，丟掉
    ] }));
    expect(r.ok && r.geometry.openings).toEqual([{ kind: "door", wall: 0, at: 3.6, w: 0.6, h: 2.1 }]);
  });

  it("家具：中心在房間外或尺寸不合理就丟掉（容許 0.3 公尺誤差）", () => {
    const chair = fixture().furniture[2];  // 不靠牆
    const r = normalizeReading(with_({ furniture: [
      { ...chair, x: 4.4 },         // 超出 0.2，保留
      { ...chair, x: 6 },           // 在房間外
      { ...chair, w: 0, d: 0.9 },   // 沒有寬度
    ] }));
    expect(r.ok && r.geometry.furniture.map(f => f.x)).toEqual([4.4]);
  });

  it("圖上標示的牆高在 2～5 公尺才採用；比例算不出來存 null", () => {
    const r = normalizeReading(with_({ wallHeightM: 3.1, scale: { mPerPx: null, source: "estimate" } }));
    expect(r.ok && r.geometry.wall_height_m).toBe(3.1);
    expect(r.ok && r.geometry.scale).toEqual({ m_per_px: null, source: "estimate" });
    const tall = normalizeReading(with_({ wallHeightM: 12 }));
    expect(tall.ok && tall.geometry.wall_height_m).toBe(DEFAULT_WALL_HEIGHT_M);
  });
});

describe("靠牆家具貼齊牆面（照片推估位置偏差大，Tina 2026-11-03）", () => {
  const walls = () => { const r = normalizeReading(fixture()); if (!r.ok) throw new Error(); return r.geometry.walls; };
  it("貼在牆內側、背面朝牆：上牆不轉、右牆 90、下牆 180、左牆 270 度", () => {
    const w = walls();
    const f = { x: 1.5, y: 1.0, w: 1.6, d: 0.4 };
    expect(snapToWall(w[0], w, f)).toEqual({ x: 1.5, y: 0.285, rot: 0 });
    expect(snapToWall(w[1], w, f)).toEqual({ x: 3.915, y: 1, rot: 90 });
    expect(snapToWall(w[2], w, f)).toEqual({ x: 1.5, y: 3.315, rot: 180 });
    expect(snapToWall(w[3], w, f)).toEqual({ x: 0.285, y: 1, rot: 270 });
  });
  it("沿牆位置不超出牆的兩端", () => {
    const w = walls();
    expect(snapToWall(w[0], w, { x: 9, y: 0, w: 2, d: 0.5 }).x).toBe(3.2);
    expect(snapToWall(w[0], w, { x: -3, y: 0, w: 2, d: 0.5 }).x).toBe(1);
  });
  it("AI 的牆有被丟掉時，門窗與家具的牆索引跟著換", () => {
    const out = fixture();
    out.walls = [{ ax: 0, ay: 0, bx: 0, by: 0, t: null }, ...out.walls];  // 長度 0 的牆會被丟掉
    out.openings = out.openings.map(o => ({ ...o, wall: o.wall + 1 }));
    out.furniture = out.furniture.map(f => ({ ...f, wall: f.wall === null ? null : f.wall + 1 }));
    const r = normalizeReading(out);
    expect(r.ok && r.geometry.openings.map(o => o.wall)).toEqual([0, 1]);
    expect(r.ok && r.geometry.furniture[0]).toMatchObject({ wall: 2, y: 3.065, rot: 180 });
  });
});
