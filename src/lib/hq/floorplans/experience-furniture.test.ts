import { describe, expect, it } from "vitest";
import type { PlanFurniture, PlanRoom } from "./types";
import {
  expandRemovedIndices, furnitureKey, omittedByRoom, parseFurnitureKey, roomsWithoutFurniture,
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
});
