// 虛擬體驗元件管理的網址（集中在這裡，避免元件互相 import 造成循環）
export const ASSETS_CATS_HREF = "/MeowHQ/assets";
export const NEW_CAT_HREF = "/MeowHQ/assets/cats/new";
export const assetsHref = (id: string) => `/MeowHQ/assets/cats/${id}`;
export const studioHref = (id: string) => `/MeowHQ/assets/cats/${id}/studio`;
/** 3D 貓咪體型預覽（#302：大貓、成貓、幼貓三分頁，?body=） */
export const BASES_HREF = "/MeowHQ/assets/bases";
/** 平面圖轉換（#138）：一戶的工作頁 */
export const floorplanHref = (id: string) => `/MeowHQ/assets/floorplans/${id}`;
/** 影片轉換（#93）：單間房的預覽頁 */
export const roomVideoHref = (id: string) => `/MeowHQ/assets/rooms/${id}`;

/** 虛擬體驗元件管理的區塊（#113：左側選單第一層；?tab= 切換）。有 parent 的是該區塊頁裡的大卡片，不放選單 */
export const ASSET_SECTIONS = [
  { value: "cats", label: "貓咪製作" },
  { value: "rooms", label: "室內空間" },
  { value: "rooms-video", label: "影片轉換", parent: "rooms" },
  { value: "rooms-polaroid", label: "寶麗來轉換", parent: "rooms" },
  { value: "rooms-floorplan", label: "平面圖轉換", parent: "rooms" },
  { value: "food", label: "飼料" },
  { value: "items", label: "生活用品" },
  { value: "others", label: "其他" },
  // 虛擬體驗（#150）：把上面做好的貓和室內空間放在一起互動
  { value: "experience", label: "虛擬體驗" },
] as const satisfies readonly { value: string; label: string; parent?: string }[];
export type AssetSection = (typeof ASSET_SECTIONS)[number]["value"];
export const isAssetSection = (v: unknown): v is AssetSection => ASSET_SECTIONS.some(s => s.value === v);
export const assetSectionHref = (v: AssetSection) => (v === "cats" ? ASSETS_CATS_HREF : `${ASSETS_CATS_HREF}?tab=${v}`);
/** 選單用：目前區塊對應的第一層（子區塊算父區塊） */
export const topSection = (v: AssetSection): AssetSection => {
  const s = ASSET_SECTIONS.find(x => x.value === v);
  return s && "parent" in s ? (s.parent as AssetSection) : v;
};
