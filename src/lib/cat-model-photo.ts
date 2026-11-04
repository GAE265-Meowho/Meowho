// 前台貓的 3D 模型照片（Issue #181）：前台照片在公開 bucket meow-cat-photos，
// 但 MeowHQ 製作頁與 paint worker 只讀私有 bucket meow-cat-model-photos 的 <模型ID>/…，
// 所以建模型時（以及修復舊資料時）要把封面照片複製過去，photo_path 指向複製後的檔案。
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET as FRONT_BUCKET } from "./supabase/config";

export const MODEL_PHOTO_BUCKET = "meow-cat-model-photos";

const EXT: Record<string, string> = { jpg: "jpg", jpeg: "jpg", png: "png", webp: "webp" };
const CONTENT_TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** 複製後的路徑：<模型ID>/photo.<副檔名>（同 MeowHQ 新增貓咪的命名） */
export function modelPhotoTarget(modelId: string, src: string): string {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(src);
  return `${modelId}/photo.${EXT[m?.[1]?.toLowerCase() ?? ""] ?? "jpg"}`;
}

/** 已經是製作用 bucket 裡這個模型的檔案 */
export const isModelPhotoPath = (modelId: string, path: string) => path.startsWith(`${modelId}/`);

/** 用 service role 複製前台照片（bucket 路徑或完整網址）到製作用 bucket；成功回新路徑 */
export async function copyFrontPhotoToModel(admin: SupabaseClient, modelId: string, src: string): Promise<string | null> {
  if (!src) return null;
  let blob: Blob | null = null;
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src).catch(() => null);
    blob = res?.ok ? await res.blob() : null;
  } else {
    blob = (await admin.storage.from(FRONT_BUCKET).download(src)).data ?? null;
  }
  if (!blob) return null;
  const target = modelPhotoTarget(modelId, src);
  const { error } = await admin.storage.from(MODEL_PHOTO_BUCKET)
    .upload(target, blob, { contentType: CONTENT_TYPE[target.split(".").pop()!], upsert: true });
  return error ? null : target;
}

/** 修復：模型的 photo_path 還是前台路徑時，複製並更新資料（舊資料用；已經修好就直接回傳） */
export async function ensureModelPhoto(admin: SupabaseClient, modelId: string, photoPath: string): Promise<string | null> {
  if (!photoPath) return null;
  if (isModelPhotoPath(modelId, photoPath)) return photoPath;
  const copied = await copyFrontPhotoToModel(admin, modelId, photoPath);
  if (copied) await admin.from("meow_cat_models").update({ photo_path: copied }).eq("id", modelId);
  return copied;
}
