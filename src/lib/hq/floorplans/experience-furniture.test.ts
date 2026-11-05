import { describe, expect, it } from "vitest";
import type { PlanFurniture, PlanRoom } from "./types";
import {
  expandRemovedIndices, followFurnitureIndices, furnitureKey, movesByRoom, omittedByRoom, parseFurnitureKey,
  resolveFurniturePose, roomsWithoutFurniture,
} from "./experience-furniture";

const f = (partial: Partial<PlanFurniture> & Pick<PlanFurniture, "kind" | "label">): PlanFurniture => ({
  x: 1, y: 1, w: 1, d: 0.5, h: 0.75, rot: 0, ...partial,
});

describe("experience-furniture", () => {
  it("furnitureKey／parseFurnitureKey", () => {
    expect(furnitureKey("r1", 2)).toBe("r1:2");
    expect(parseFurnitureKey("r1:2")).toEqual({ roomId: "r1", index: 2 });
    expect(parseFurnitureKey("bad")).toBeNull();
  });

  it("父被移除時，桌上 nested 一併列入", () => {
    const list = [
      f({ kind: "desk", label: "書桌" }),
      f({ kind: "computer", label: "螢幕", parent: 0 }),
      f({ kind: "fan", label: "風扇" }),
      f({ kind: "cup", label: "杯", parent: 0 }),
    ];
    expect([...expandRemovedIndices(list, new Set([0]))].sort()).toEqual([0, 1, 3]);
    expect([...expandRemovedIndices(list, new Set([2]))].sort()).toEqual([2]);
  });

  it("roomsWithoutFurniture 拿掉家具並重編 parent", () => {
    const room = {
      id: "r1", name: "房", image_path: "x", status: "ready" as const, created_at: "t",
      walls: [], furniture: [
        f({ kind: "desk", label: "書桌" }),
        f({ kind: "computer", label: "螢幕", parent: 0, elev: 0.75 }),
        f({ kind: "bed", label: "床" }),
        f({ kind: "cup", label: "杯", parent: 0, elev: 0.75 }),
      ],
    } satisfies PlanRoom;
    const next = roomsWithoutFurniture([room], [furnitureKey("r1", 0)]);
    expect(next[0].furniture?.map(x => x.kind)).toEqual(["bed"]);
    const onlyFan = roomsWithoutFurniture([room], [furnitureKey("r1", 2)]);
    expect(onlyFan[0].furniture?.map(x => x.kind)).toEqual(["desk", "computer", "cup"]);
    expect(onlyFan[0].furniture?.[1].parent).toBe(0);
  });

  it("omittedByRoom 依房分開", () => {
    const rooms = [
      { id: "a", name: "A", image_path: "x", status: "ready" as const, created_at: "t", furniture: [f({ kind: "fan", label: "扇" })] },
      { id: "b", name: "B", image_path: "x", status: "ready" as const, created_at: "t", furniture: [f({ kind: "bed", label: "床" })] },
    ];
    const map = omittedByRoom(rooms, [furnitureKey("a", 0)]);
    expect(map.get("a")).toEqual(new Set([0]));
    expect(map.get("b")).toBeUndefined();
  });

  it("resolveFurniturePose：自己有 move 用自己的；nested 跟父平移", () => {
    const list = [
      f({ kind: "desk", label: "書桌", x: 2, y: 3, h: 0.75 }),
      f({ kind: "computer", label: "螢幕", x: 2.2, y: 3.1, parent: 0, elev: 0.75, h: 0.35 }),
    ];
    const shift: [number, number] = [1, 1];
    expect(resolveFurniturePose(list, 0, shift)).toMatchObject({ x: 1, z: 2, rot: 0, elev: 0 });
    expect(resolveFurniturePose(list, 1, shift)).toMatchObject({ x: 1.2, z: 2.1, elev: 0.75 });
    const moves = new Map([[0, { x: 4, z: 5, rot: 0, support: null }]]);
    expect(resolveFurniturePose(list, 0, shift, moves)).toMatchObject({ x: 4, z: 5 });
    expect(resolveFurniturePose(list, 1, shift, moves)).toMatchObject({ x: 4.2, z: 5.1, elev: 0.75 });
  });

  it("resolveFurniturePose：拆開到地板後不再跟父；掛 support 用父頂 elev", () => {
    const list = [
      f({ kind: "desk", label: "書桌", x: 2, y: 2, h: 0.75 }),
      f({ kind: "computer", label: "螢幕", x: 2.2, y: 2.1, parent: 0, elev: 0.75, h: 0.35 }),
    ];
    const shift: [number, number] = [0, 0];
    const detached = new Map([[1, { x: 0.5, z: 0.5, rot: 90, support: null }]]);
    expect(resolveFurniturePose(list, 1, shift, detached)).toMatchObject({ x: 0.5, z: 0.5, rot: 90, elev: 0 });
    const onDesk = new Map([[1, { x: 2.1, z: 2.0, rot: 0, support: { furnitureIndex: 0, localX: 0.1, localZ: 0 } }]]);
    expect(resolveFurniturePose(list, 1, shift, onDesk)).toMatchObject({ x: 2.1, z: 2, elev: 0.75 });
  });

  it("followFurnitureIndices：有獨立 move 的子孫不跟", () => {
    const list = [
      f({ kind: "desk", label: "書桌" }),
      f({ kind: "computer", label: "螢幕", parent: 0 }),
      f({ kind: "cup", label: "杯", parent: 0 }),
    ];
    expect([...followFurnitureIndices(list, 0)].sort()).toEqual([0, 1, 2]);
    const moves = new Map([[1, { x: 1, z: 1, rot: 0, support: null }]]);
    expect([...followFurnitureIndices(list, 0, moves)].sort()).toEqual([0, 2]);
  });

  it("movesByRoom 依房與索引分組並正規化", () => {
    const map = movesByRoom({
      [furnitureKey("a", 0)]: { x: 1, z: 2 },
      [furnitureKey("a", 2)]: { x: 3, z: 4, rot: 90 },
      [furnitureKey("b", 1)]: { x: 5, z: 6, support: null },
    });
    expect(map.get("a")?.get(0)).toEqual({ x: 1, z: 2, rot: 0, support: null });
    expect(map.get("a")?.get(2)).toMatchObject({ x: 3, z: 4, rot: 90 });
    expect(map.get("b")?.get(1)).toMatchObject({ x: 5, z: 6, support: null });
  });
});
