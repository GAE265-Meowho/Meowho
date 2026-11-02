// 虛擬體驗元件管理的網址（集中在這裡，避免元件互相 import 造成循環）
export const ASSETS_CATS_HREF = "/MeowHQ/assets";
export const NEW_CAT_HREF = "/MeowHQ/assets/cats/new";
export const assetsHref = (id: string) => `/MeowHQ/assets/cats/${id}`;
export const studioHref = (id: string) => `/MeowHQ/assets/cats/${id}/studio`;
/** 兩隻體型骨架預覽（成貓、幼貓） */
export const BASES_HREF = "/MeowHQ/assets/bases";
export const baseLabHref = (body: "adult" | "kitten") => `/MeowHQ/assets/bases/${body}`;
