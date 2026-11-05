// 虛擬體驗：讀圖家具可暫時移除／拖移（session，不寫回 meta）
import type { PlanFurniture, PlanRoom, Point } from "./types";

/** 房間座標（已平移到左上角＝原點的 x／z，與 SceneBox 相同） */
export type FurnitureMove = { x: number; z: number };

export function furnitureKey(roomId: string, index: number): string {
  return `${roomId}:${index}`;
}

export function parseFurnitureKey(key: string): { roomId: string; index: number } | null {
  const i = key.lastIndexOf(":");
  if (i <= 0) return null;
  const roomId = key.slice(0, i);
  const index = Number(key.slice(i + 1));
  if (!roomId || !Number.isInteger(index) || index < 0) return null;
  return { roomId, index };
}

/** 父家具被移除時，子物（parent 指向父）一併移除；拖移時同集合＝跟隨的子孫 */
export function expandRemovedIndices(furniture: PlanFurniture[], removed: Set<number>): Set<number> {
  const out = new Set(removed);
  let grew = true;
  while (grew) {
    grew = false;
    furniture.forEach((f, i) => {
      if (out.has(i)) return;
      if (typeof f.parent === "number" && out.has(f.parent)) {
        out.add(i);
        grew = true;
      }
    });
  }
  return out;
}

/** 各房要省略的家具原始索引（已含 nested 連動） */
export function omittedByRoom(rooms: PlanRoom[], removedKeys: Iterable<string>): Map<string, Set<number>> {
  const raw = new Map<string, Set<number>>();
  for (const key of removedKeys) {
    const p = parseFurnitureKey(key);
    if (!p) continue;
    if (!raw.has(p.roomId)) raw.set(p.roomId, new Set());
    raw.get(p.roomId)!.add(p.index);
  }
  const out = new Map<string, Set<number>>();
  for (const room of rooms) {
    const seed = raw.get(room.id);
    if (!seed?.size || !room.furniture?.length) continue;
    out.set(room.id, expandRemovedIndices(room.furniture, seed));
  }
  return out;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/** 各房的家具位移（key＝furnitureKey）→ Map<roomId, Map<index, pose>> */
export function movesByRoom(moves: Record<string, FurnitureMove> | Map<string, FurnitureMove>): Map<string, Map<number, FurnitureMove>> {
  const entries = moves instanceof Map ? moves.entries() : Object.entries(moves);
  const out = new Map<string, Map<number, FurnitureMove>>();
  for (const [key, pose] of entries) {
    const p = parseFurnitureKey(key);
    if (!p) continue;
    if (!out.has(p.roomId)) out.set(p.roomId, new Map());
    out.get(p.roomId)!.set(p.index, { x: r3(pose.x), z: r3(pose.z) });
  }
  return out;
}

/**
 * 算出家具在房間座標的 x／z：有自己的 move 用自己的；nested 跟父姿態相對偏移。
 * shift＝房間左上角（與 roomBoxes 相同）。
 */
export function resolveFurniturePose(
  furniture: PlanFurniture[],
  index: number,
  shift: Point,
  moves?: Map<number, FurnitureMove>,
  seen: Set<number> = new Set(),
): FurnitureMove {
  if (seen.has(index) || !furniture[index]) {
    const f = furniture[index];
    if (!f) return { x: 0, z: 0 };
    return { x: r3(f.x - shift[0]), z: r3(f.y - shift[1]) };
  }
  seen.add(index);
  const own = moves?.get(index);
  if (own) return { x: r3(own.x), z: r3(own.z) };

  const f = furniture[index];
  const base = { x: r3(f.x - shift[0]), z: r3(f.y - shift[1]) };
  if (typeof f.parent !== "number" || !furniture[f.parent]) return base;

  const parentPose = resolveFurniturePose(furniture, f.parent, shift, moves, seen);
  const origParent = {
    x: r3(furniture[f.parent].x - shift[0]),
    z: r3(furniture[f.parent].y - shift[1]),
  };
  return {
    x: r3(parentPose.x + (base.x - origParent.x)),
    z: r3(parentPose.z + (base.z - origParent.z)),
  };
}

/** 從房間列表拿掉已移除家具（並重編 parent）；給測試／需要 clone 房間時用 */
export function roomsWithoutFurniture<T extends PlanRoom>(rooms: T[], removedKeys: Iterable<string>): T[] {
  const omitMap = omittedByRoom(rooms, removedKeys);
  if (!omitMap.size) return rooms;
  return rooms.map(room => {
    const drop = omitMap.get(room.id);
    if (!drop?.size || !room.furniture?.length) return room;
    const oldToNew = new Map<number, number>();
    const next: PlanFurniture[] = [];
    room.furniture.forEach((f, i) => {
      if (drop.has(i)) return;
      oldToNew.set(i, next.length);
      next.push({ ...f });
    });
    for (const f of next) {
      if (typeof f.parent !== "number") continue;
      const np = oldToNew.get(f.parent);
      if (np === undefined) {
        delete f.parent;
        delete f.elev;
      } else f.parent = np;
    }
    return { ...room, furniture: next };
  });
}
