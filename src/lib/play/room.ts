// 虛擬飼養 DEMO（#237）：兩種示範房間（3D 掃描房間、平面圖 3D 娃娃屋）整理成同一份「物品清單」，
// 劇情裡的〈通稱〉換成這間房的家具，規則在 furniture.ts（照 catgame 原版 FURN_WORD）。
// 純函式。
import zhezhe from "./fixtures/zhezhe-room.json";
import type { PlanGeometry, PlanRoom } from "@/lib/hq/floorplans/types";

/** 「我的 3D 房間」預設用這間（影片轉的掃描房間，子哲喵戶名下的私有房間；只有房間主人讀得到，其他人會 404，不是壞掉） */
export const DEFAULT_ROOM_ID = "room_20261107_031215";

/**
 * 公開示範房間：後台複製出來、不屬於任何喵戶的同一份成果（2026-11-07 issue 回覆）。任何人都讀得到，沒有「自己的房間」時用這間。
 * 沒有 scene.splat 是正常的：有 objects/room_cut.splat 時檢視器改讀 room_cut。
 */
export const DEMO_ROOM_ID = `${DEFAULT_ROOM_ID}_1`;
export const DEMO_ROOM_BASE = "https://onebpkbkrnnwamwsoelo.supabase.co/storage/v1/object/public/meow-room-models/results/5c7534dca1c6b2c0";

/** 掃描房間資料夾網址：自己的房間 ＞ 環境變數 NEXT_PUBLIC_ROOM_DEMO_BASE ＞ 公開示範房間；undefined＝還在查自己的房間 */
export function pickScanBase(mine: string | null | undefined, env: string | null): string | undefined {
  if (mine === undefined) return undefined;
  return mine ?? env ?? DEMO_ROOM_BASE;
}

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
 * 「3D 掃描房間」是玩家自己的房間（PlayGame 進頁面時在背景讀 scene.json，見 pickScanBase）。
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

/** 掃描房間：scene.json 的 objects[]。label 可能是英文（bed），中文在 name_zh，優先用 name_zh；沒有再用 label */
export function inventoryFromScan(scene: { objects?: { label?: unknown; name_zh?: unknown }[] }): RoomInventory {
  const zh = (o: { label?: unknown; name_zh?: unknown } | undefined) => {
    const n = typeof o?.name_zh === "string" ? o.name_zh.trim() : "";
    return n || (typeof o?.label === "string" ? o.label : "");
  };
  const labels = uniq((scene.objects ?? []).map(zh));
  return { kind: "scan", labels, hasWindow: labels.some(l => l.includes("窗")) };
}
