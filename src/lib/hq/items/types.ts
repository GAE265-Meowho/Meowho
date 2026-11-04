// MeowHQ 生活用品（#197）：類別、用品、上傳限制與尺寸檢查。
export const ITEM_BUCKET = "meow-items";
export const MAX_ITEM_BYTES = 20 * 1024 * 1024;
export const GLB_MIME = ["model/gltf-binary", "application/octet-stream"] as const;

export interface ItemCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface HouseholdItem {
  id: string;
  name: string;
  nameEn: string | null;
  categoryId: string;
  categoryName: string;
  priceTwd: number | null;
  instructions: string | null;
  modelPath: string;
  modelUrl: string;
  widthM: number | null;
  depthM: number | null;
  heightM: number | null;
  createdAt: string;
}

export interface ItemFilter {
  categoryIds?: string[];
  query?: string;
}

export type ItemProblem =
  | "file_invalid"
  | "file_too_large"
  | "name_required"
  | "category_required"
  | "model_invalid"
  | "category_name_required"
  | "category_in_use"
  | "not_found"
  | "permission_denied";

export function checkGlb(type: unknown, size: unknown): Extract<ItemProblem, "file_invalid" | "file_too_large"> | null {
  const t = typeof type === "string" ? type.toLowerCase() : "";
  const okType = !t || t === "model/gltf-binary" || t === "application/octet-stream" || t.endsWith(".glb");
  if (!okType) return "file_invalid";
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "file_invalid";
  if (size > MAX_ITEM_BYTES) return "file_too_large";
  return null;
}

export function newItemPath(now = new Date()): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${now.getTime()}-${Math.random().toString(16).slice(2)}`;
  return `${id}/model.glb`;
}

/** 以公尺檢查 GLB 外框；太大視為公分／毫米匯出，回傳建議縮放。 */
export function normalizeItemMeters(size: { x: number; y: number; z: number }): {
  widthM: number; depthM: number; heightM: number; scale: number; warning: string | null;
} {
  const max = Math.max(size.x, size.y, size.z);
  let scale = 1;
  let warning: string | null = null;
  if (max > 50) { scale = 0.001; warning = "模型看起來像用毫米匯出，已自動換成公尺。"; }
  else if (max > 5) { scale = 0.01; warning = "模型看起來像用公分匯出，已自動換成公尺。"; }
  else if (max < 0.05) { warning = "模型尺寸過小，請確認匯出單位是公尺。"; }
  const r = (n: number) => Math.round(n * scale * 1000) / 1000;
  return { widthM: r(size.x), heightM: r(size.y), depthM: r(size.z), scale, warning };
}

export function filterItems(items: HouseholdItem[], filter: ItemFilter): HouseholdItem[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  const cats = filter.categoryIds ?? [];
  return items.filter(it => {
    if (cats.length && !cats.includes(it.categoryId)) return false;
    if (!q) return true;
    return [it.name, it.nameEn ?? "", it.categoryName, it.instructions ?? ""].some(s => s.toLowerCase().includes(q));
  });
}

export function formatItemPrice(price: number | null): string {
  if (price == null) return "價格未定";
  return `NT$${price.toLocaleString("zh-TW")}`;
}
