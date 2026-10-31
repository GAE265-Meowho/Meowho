// 貓影片的上傳規則與路徑（#72）。純邏輯，儲存服務以參數注入（測試用記憶體版）。
import type { MediaStore, UploadTarget } from "./types";
import { UPLOAD_TTL_SEC } from "./types";

export const MAX_VIDEOS_PER_CAT = 3;
export const MAX_VIDEO_SEC = 60;
/** 手機 60 秒 1080p 約 100 MB；超過多半是 4K，請使用者改用較低畫質 */
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

export const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

export type VideoUploadError = "unsupported_type" | "too_large" | "too_long" | "invalid_duration" | "too_many_videos";

export interface VideoUploadRequest { mime: string; sizeBytes: number; durationSec: number }

export function validateVideoUpload(v: VideoUploadRequest, existingCount: number): VideoUploadError | null {
  if (existingCount >= MAX_VIDEOS_PER_CAT) return "too_many_videos";
  if (!VIDEO_EXT[v.mime]) return "unsupported_type";
  if (v.sizeBytes > MAX_VIDEO_BYTES) return "too_large";
  if (!(v.durationSec > 0)) return "invalid_duration";
  if (v.durationSec > MAX_VIDEO_SEC) return "too_long";
  return null;
}

const SAFE_ID = /^[A-Za-z0-9-]+$/;

export function catVideoPath(catId: string, id: string, mime: string): string {
  if (!SAFE_ID.test(catId) || !SAFE_ID.test(id)) throw new Error("invalid_id");
  const ext = VIDEO_EXT[mime];
  if (!ext) throw new Error("unsupported_type");
  return `cats/${catId}/videos/${id}.${ext}`;
}

/** 檢查通過才簽發上傳網址；路徑之後寫進 meow_cat_videos.storage_path */
export async function prepareCatVideoUpload(
  store: MediaStore,
  req: VideoUploadRequest & { catId: string; existingCount: number },
  newId: () => string = () => crypto.randomUUID(),
): Promise<{ ok: true; path: string; upload: UploadTarget } | { ok: false; error: VideoUploadError }> {
  const error = validateVideoUpload(req, req.existingCount);
  if (error) return { ok: false, error };
  const path = catVideoPath(req.catId, newId(), req.mime);
  return { ok: true, path, upload: await store.uploadUrl(path, req.mime, UPLOAD_TTL_SEC) };
}

/** 刪除貓或影片時一起刪檔（資料庫的連動刪除不會刪雲端檔案） */
export async function removeMedia(store: MediaStore, paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => store.remove(p)));
}
