import "server-only";
// API route 用的入口：依環境變數取得儲存服務；未設定時回傳 null（示範模式，影片上傳關閉）
import { createAzureStore } from "./azure";
import { storageConfig } from "./config";
import type { MediaStore } from "./types";

let cached: MediaStore | null | undefined;

export function getMediaStore(): MediaStore | null {
  if (cached === undefined) {
    const cfg = storageConfig(process.env);
    cached = cfg?.provider === "azure" ? createAzureStore(cfg) : null;
  }
  return cached;
}
