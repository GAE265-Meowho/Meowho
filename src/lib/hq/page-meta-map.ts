// MeowHQ 頁尾：功能／tab → 對應原始碼路徑（供 git log 與 resolve）
// 新增側欄功能或 ?tab= 時在此補 key 與 paths。

export type HqPageMetaKey = keyof typeof HQ_PAGE_META_PATHS;

/** 各功能／tab 納入「最後修改」計算的路徑（相對 repo 根目錄） */
export const HQ_PAGE_META_PATHS = {
  home: [
    "src/app/MeowHQ/page.tsx",
  ],
  households: [
    "src/app/MeowHQ/households",
    "src/components/hq/households",
    "src/lib/hq/households.ts",
    "src/lib/hq/households.test.ts",
  ],
  reports: [
    "src/app/MeowHQ/reports",
  ],
  users: [
    "src/app/MeowHQ/users",
    "src/components/hq/users",
    "src/lib/hq/users.ts",
    "src/lib/hq/users.test.ts",
  ],
  products: [
    "src/app/MeowHQ/products",
  ],
  knowledge: [
    "src/app/MeowHQ/knowledge",
  ],
  "admin/auth": [
    "src/app/MeowHQ/admin/page.tsx",
    "src/app/MeowHQ/admin/AuthTab.tsx",
    "src/lib/hq/admin-auth.ts",
    "src/lib/hq/admin-auth.test.ts",
  ],
  "admin/audit": [
    "src/app/MeowHQ/admin/AuditTab.tsx",
    "src/lib/hq/audit.ts",
    "src/lib/hq/audit.test.ts",
  ],
  "admin/stats": [
    "src/app/MeowHQ/admin/StatsTab.tsx",
  ],
  "admin/settings": [
    "src/app/MeowHQ/admin/SettingsTab.tsx",
  ],
  "assets/cats": [
    "src/app/MeowHQ/assets/page.tsx",
    "src/app/MeowHQ/assets/cats",
    "src/app/MeowHQ/assets/bases",
    "src/components/hq/assets/CatsTab.tsx",
    "src/components/hq/assets/CatPage.tsx",
    "src/components/hq/assets/CatPreview.tsx",
    "src/components/hq/assets/NewCat.tsx",
    "src/components/hq/assets/StudioPage.tsx",
    "src/components/hq/assets/BaseLab.tsx",
    "src/components/hq/assets/BaseSamples.tsx",
    "src/components/hq/assets/AiViews.tsx",
    "src/components/hq/assets/ClipList.tsx",
    "src/components/hq/assets/catLook.ts",
    "src/components/hq/assets/catEye.ts",
    "src/components/hq/assets/useCatModels.ts",
    "src/components/hq/assets/hrefs.ts",
    "src/lib/hq/cat-models",
  ],
  "assets/rooms": [
    "src/components/hq/assets/RoomsTab.tsx",
    "src/components/hq/assets/RoomViewer.tsx",
    "src/lib/hq/rooms",
  ],
  "assets/rooms-video": [
    "src/components/hq/assets/RoomVideoTab.tsx",
    "src/components/hq/assets/RoomUpload.tsx",
    "src/components/hq/assets/RoomProgress.tsx",
  ],
  "assets/rooms-polaroid": [
    "src/components/hq/assets/PlannedTab.tsx",
  ],
  "assets/rooms-floorplan": [
    "src/app/MeowHQ/assets/floorplans",
    "src/components/hq/assets/FloorplanTab.tsx",
    "src/components/hq/assets/FloorplanHouse.tsx",
    "src/components/hq/assets/FloorplanViewer.tsx",
    "src/components/hq/assets/floorplanApi.ts",
    "src/lib/hq/floorplans",
  ],
  "assets/food": [
    "src/components/hq/assets/FoodTab.tsx",
    "src/lib/hq/food",
  ],
  "assets/items": [
    "src/components/hq/assets/ItemsTab.tsx",
    "src/components/hq/assets/ItemPreview.tsx",
    "src/components/hq/assets/ItemGlbThumb.tsx",
    "src/components/hq/assets/itemDrag.ts",
    "src/lib/hq/items",
  ],
  "assets/others": [
    "src/components/hq/assets/PlannedTab.tsx",
  ],
  "assets/experience": [
    "src/components/hq/assets/ExperienceTab.tsx",
    "src/components/hq/assets/ExperienceItemPalette.tsx",
    "src/lib/hq/floorplans/experience-furniture.ts",
    "src/lib/hq/floorplans/experience-furniture.test.ts",
    "src/lib/hq/floorplans/experience-physics.ts",
    "src/lib/hq/floorplans/experience-physics.test.ts",
    "src/lib/hq/floorplans/catwalk.ts",
    "src/lib/hq/floorplans/catwalk.test.ts",
    "src/lib/hq/floorplans/catjump.ts",
    "src/lib/hq/floorplans/catjump.test.ts",
  ],
} as const satisfies Record<string, readonly string[]>;

export const HQ_PAGE_META_KEYS = Object.keys(HQ_PAGE_META_PATHS) as HqPageMetaKey[];

const ADMIN_TABS = ["auth", "audit", "stats", "settings"] as const;
type AdminTab = (typeof ADMIN_TABS)[number];
const isAdminTab = (v: string): v is AdminTab => (ADMIN_TABS as readonly string[]).includes(v);

const ASSET_TABS = [
  "cats",
  "rooms",
  "rooms-video",
  "rooms-polaroid",
  "rooms-floorplan",
  "food",
  "items",
  "others",
  "experience",
] as const;
type AssetTab = (typeof ASSET_TABS)[number];
const isAssetTab = (v: string): v is AssetTab => (ASSET_TABS as readonly string[]).includes(v);

/** 由 pathname + search（含 ?tab=）算出頁尾 meta key；子路徑繼承所屬功能／tab */
export function resolvePageMetaKey(pathname: string, search = ""): HqPageMetaKey {
  const path = pathname.replace(/\/+$/, "") || "/MeowHQ";
  const tab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab") ?? "";

  if (path === "/MeowHQ") return "home";
  if (path.startsWith("/MeowHQ/households")) return "households";
  if (path.startsWith("/MeowHQ/reports")) return "reports";
  if (path.startsWith("/MeowHQ/users")) return "users";
  if (path.startsWith("/MeowHQ/products")) return "products";
  if (path.startsWith("/MeowHQ/knowledge")) return "knowledge";

  if (path.startsWith("/MeowHQ/admin")) {
    const t = isAdminTab(tab) ? tab : "auth";
    return `admin/${t}`;
  }

  if (path.startsWith("/MeowHQ/assets/floorplans")) return "assets/rooms-floorplan";
  if (path.startsWith("/MeowHQ/assets/cats") || path.startsWith("/MeowHQ/assets/bases")) return "assets/cats";
  if (path.startsWith("/MeowHQ/assets")) {
    const t = isAssetTab(tab) ? tab : "cats";
    return `assets/${t}`;
  }

  return "home";
}
