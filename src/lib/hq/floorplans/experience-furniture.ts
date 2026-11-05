// 虛擬體驗：讀圖家具可暫時移除（session，不寫回 meta）
import type { PlanFurniture, PlanRoom } from "./types";

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

/** 父家具被移除時，子物（parent 指向父）一併移除 */
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
