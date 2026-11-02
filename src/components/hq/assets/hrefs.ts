// 虛擬體驗元件管理的網址（集中在這裡，避免元件互相 import 造成循環）
export const ASSETS_CATS_HREF = "/MeowHQ/assets";
export const NEW_CAT_HREF = "/MeowHQ/assets/cats/new";
export const assetsHref = (id: string) => `/MeowHQ/assets/cats/${id}`;
export const studioHref = (id: string) => `/MeowHQ/assets/cats/${id}/studio`;
/** 兩隻體型骨架預覽（成貓、幼貓） */
export const BASES_HREF = "/MeowHQ/assets/bases";
export const baseLabHref = (body: "adult" | "kitten") => `/MeowHQ/assets/bases/${body}`;

/** 虛擬體驗元件管理的區塊（#113 移到左側子選單；?tab= 切換）。depth 2＝室內空間底下的子項目 */
export const ASSET_SECTIONS = [
  { value: "cats", label: "貓咪製作", depth: 1 },
  { value: "rooms", label: "室內空間", depth: 1 },
  { value: "rooms-polaroid", label: "寶麗來轉換", depth: 2 },
  { value: "rooms-floorplan", label: "平面圖轉換", depth: 2 },
  { value: "food", label: "飼料", depth: 1 },
  { value: "items", label: "生活用品", depth: 1 },
  { value: "others", label: "其他", depth: 1 },
] as const;
export type AssetSection = (typeof ASSET_SECTIONS)[number]["value"];
export const isAssetSection = (v: unknown): v is AssetSection => ASSET_SECTIONS.some(s => s.value === v);
export const assetSectionHref = (v: AssetSection) => (v === "cats" ? ASSETS_CATS_HREF : `${ASSETS_CATS_HREF}?tab=${v}`);
