// 測試容器（media-dev）→ 正式容器（media）的檔案複製。
// 兩邊路徑完全相同，所以資料庫裡的 storage_path 搬到正式時不用改。
// 只補正式沒有的檔案，不覆蓋、不刪測試端；範圍限定資料夾，避免整個容器被複製。
import type { MediaStore } from "./types";
import { VIDEO_EXT } from "./media";

const EXTRA_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  glb: "model/gltf-binary", json: "application/json",
};
const TYPE_OF_EXT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(VIDEO_EXT).map(([mime, ext]) => [ext, mime])),
  ...EXTRA_TYPES,
};

export function contentTypeOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_OF_EXT[ext] ?? "application/octet-stream";
}

export interface PromotionPlan { copy: string[]; skip: string[] }

/** prefixes 例：["cats/<貓 id>/", "homes/<房間 id>/scene/"] */
export async function planPromotion(from: MediaStore, to: MediaStore, prefixes: string[]): Promise<PromotionPlan> {
  if (!prefixes.length || prefixes.some((p) => !/^[^/]+\/(.+\/)?$/.test(p))) throw new Error("invalid_prefix");
  const copy: string[] = [];
  const skip: string[] = [];
  for (const prefix of prefixes) {
    const existing = new Set(await to.list(prefix));
    for (const path of await from.list(prefix)) (existing.has(path) ? skip : copy).push(path);
  }
  return { copy, skip };
}

export async function promote(
  from: MediaStore,
  to: MediaStore,
  plan: PromotionPlan,
  onCopied: (path: string) => void = () => {},
): Promise<{ copied: number; missing: string[] }> {
  const missing: string[] = [];
  let copied = 0;
  for (const path of plan.copy) {
    const bytes = await from.download(path);
    if (!bytes) { missing.push(path); continue; }
    await to.put(path, bytes, contentTypeOf(path));
    copied++;
    onCopied(path);
  }
  return { copied, missing };
}
