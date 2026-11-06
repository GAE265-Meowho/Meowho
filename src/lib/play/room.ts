// 虛擬飼養 DEMO（#237）：兩種示範房間（3D 掃描房間、平面圖 3D 娃娃屋）整理成同一份「物品清單」，
// 劇情裡的〈通稱〉換成這間房的家具，規則在 furniture.ts（照 catgame 原版 FURN_WORD）。
// 純函式。
import zhezhe from "./fixtures/zhezhe-room.json";
import type { PlanGeometry, PlanRoom } from "@/lib/hq/floorplans/types";

export type RoomKind = "scan" | "dollhouse";

export interface RoomInventory {
  kind: RoomKind;
  /** 房間裡的家具與物品（中文名稱，去重） */
  labels: string[];
  hasWindow: boolean;
}

/**
 * 範例房間（平面圖 3D 娃娃屋）：後台「平面圖轉換 → 子哲的家」的 Room2（room_20261103_012917／r5），
 * 讀圖結果已整理好的格局，直接存成範例檔，玩家不必登入總部就能看到。要換房間只要換 fixtures/zhezhe-room.json。
 * 「3D 掃描房間」則當成玩家自己上傳的房間（RoomStep 讀 NEXT_PUBLIC_ROOM_DEMO_BASE/scene.json）。
 */
export const DEMO_DOLLHOUSE: PlanRoom = {
  id: "r5", name: "子哲的家（範例）", image_path: "floorplans/room_20261103_012917/r5.jpg", status: "ready",
  created_at: "2026-11-05T04:20:47.888Z",
  ...(zhezhe as unknown as PlanGeometry),
};

const uniq = (xs: string[]) => [...new Set(xs.map(x => x.trim()).filter(Boolean))];

export function inventoryFromPlan(room: PlanRoom): RoomInventory {
  const openings = room.openings ?? [];
  const hasWindow = openings.some(o => o.kind === "window");
  return {
    kind: "dollhouse",
    labels: uniq([
      ...(room.furniture ?? []).map(f => f.label),
      ...(openings.some(o => o.kind === "door") ? ["門"] : []),
      ...(hasWindow ? ["窗戶"] : []),
    ]),
    hasWindow,
  };
}

/** 掃描房間：scene.json 的 objects[].label（worker 已轉成中文，見 readiness.md） */
export function inventoryFromScan(scene: { objects?: { label?: unknown }[] }): RoomInventory {
  const labels = uniq((scene.objects ?? []).map(o => (typeof o?.label === "string" ? o.label : "")));
  return { kind: "scan", labels, hasWindow: labels.some(l => l.includes("窗")) };
}
