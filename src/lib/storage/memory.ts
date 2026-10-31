// 記憶體版儲存：給測試與本機示範模式用，行為與 Azure 版相同（同一個 MediaStore 介面）
import type { MediaStore } from "./types";

export function createMemoryStore(): MediaStore {
  const files = new Map<string, Uint8Array>();
  return {
    put: async (path, bytes) => { files.set(path, bytes); },
    list: async (prefix) => [...files.keys()].filter((p) => p.startsWith(prefix)).sort(),
    uploadUrl: async (path, contentType) => ({ url: `memory://upload/${path}`, headers: { "content-type": contentType } }),
    readUrl: async (path) => `memory://read/${path}`,
    download: async (path) => files.get(path) ?? null,
    remove: async (path) => { files.delete(path); },
  };
}
