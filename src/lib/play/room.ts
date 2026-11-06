// 虛擬飼養 DEMO（#237）：兩種示範房間（3D 掃描房間、平面圖 3D 娃娃屋）整理成同一份「物品清單」，
// 劇情裡的家具通稱（〈躲藏處〉〈高處〉…）依 spec 09 §7.3 的替換規則換成這間房真的有的東西（task-run.ts 的 placeFor）。
// 純函式。
import { floorplanRoomSchema } from "@/lib/ai/schemas";
import living from "@/lib/hq/floorplans/fixtures/living-room.json";
import { normalizeReading } from "@/lib/hq/floorplans/read";
import type { PlanRoom } from "@/lib/hq/floorplans/types";
import { placeFor } from "@/lib/task-run";

export type RoomKind = "scan" | "dollhouse";

export interface RoomInventory {
  kind: RoomKind;
  /** 房間裡的家具與物品（中文名稱，去重） */
  labels: string[];
  hasWindow: boolean;
}

/**
 * 娃娃屋示範房間：後台平面圖讀圖的固定範例（客廳）再加幾件常見家具與小物，讓 AI／規則辨認得到電線、水杯、花瓶。
 * 座標是房間平面公尺（原點左上），和讀圖結果同格式，經 read.ts 的 normalizeReading 貼牆、放上桌面。
 */
const EXTRA_FURNITURE = [
  { kind: "desk", label: "書桌", wall: 3, parent: null, x: 0.3, y: 1.7, w: 1.1, d: 0.55, rot: 0 },
  { kind: "computer", label: "電腦", wall: null, parent: 3, x: 0.3, y: 1.7, w: 0.5, d: 0.22, rot: 0 },
  { kind: "table", label: "茶几", wall: null, parent: null, x: 1.6, y: 1.55, w: 1.0, d: 0.5, rot: 0 },
  { kind: "cup", label: "水杯", wall: null, parent: 5, x: 1.85, y: 1.55, w: 0.08, d: 0.08, rot: 0 },
  { kind: "cabinet", label: "櫃子", wall: 1, parent: null, x: 3.95, y: 3.0, w: 0.9, d: 0.45, rot: 0 },
  { kind: "vase", label: "花瓶", wall: null, parent: 7, x: 3.95, y: 3.0, w: 0.12, d: 0.12, rot: 0 },
] as const;

function buildDollhouse(): PlanRoom {
  const reading = normalizeReading(floorplanRoomSchema.parse({
    ...structuredClone(living),
    furniture: [...living.furniture, ...EXTRA_FURNITURE.map(f => ({ ...f }))],
  }));
  if (!reading.ok) throw new Error(reading.error);
  return {
    id: "r1", name: "示範客廳", image_path: "demo/living-room", status: "ready", created_at: "2026-11-06T00:00:00Z",
    ...reading.geometry,
  };
}

export const DEMO_DOLLHOUSE: PlanRoom = buildDollhouse();

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

/** 劇情用的家具通稱 */
export interface Places {
  /** 〈躲藏處〉 */
  hide: string;
  /** 〈高處〉 */
  high: string;
  /** 〈沙發〉 */
  sofa: string;
  /** 〈桌上小物〉；沒有桌子時 null（相關劇情只用文字） */
  tableItem: string | null;
  /** 〈門〉 */
  door: string | null;
}

/** 依 spec 09 §7.3 找替代品；都找不到時用文字情境的說法（不播 3D 動作） */
export function placesOf(labels: string[]): Places {
  return {
    hide: placeFor("hiding_spot", labels) ?? "房間角落",
    high: placeFor("high_place", labels) ?? "窗台",
    sofa: placeFor("sofa", labels) ?? "地毯",
    tableItem: placeFor("table_item", labels),
    door: placeFor("door", labels),
  };
}

/** 把劇情文字裡的通稱與 {name} 換掉 */
export function fillPlaces(text: string, p: Places, name: string): string {
  return text
    .replaceAll("{name}", name)
    .replaceAll("〈躲藏處〉", p.hide)
    .replaceAll("〈高處〉", p.high)
    .replaceAll("〈沙發〉", p.sofa)
    .replaceAll("〈桌上小物〉", p.tableItem ?? "桌上的東西")
    .replaceAll("〈門〉", p.door ?? "門");
}
