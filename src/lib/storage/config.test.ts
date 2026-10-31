import { describe, expect, it } from "vitest";
import { storageConfig } from "./config";

describe("依環境變數選擇儲存服務", () => {
  it("Azure 三個值都有才啟用", () => {
    expect(storageConfig({ MEDIA_STORAGE: "azure", AZURE_STORAGE_ACCOUNT: "meowho", AZURE_STORAGE_KEY: "k", AZURE_STORAGE_CONTAINER: "media" }))
      .toEqual({ provider: "azure", account: "meowho", key: "k", container: "media" });
  });
  it("缺任何一個就回 null（示範模式，影片上傳關閉）", () => {
    expect(storageConfig({ MEDIA_STORAGE: "azure", AZURE_STORAGE_ACCOUNT: "meowho" })).toBeNull();
    expect(storageConfig({})).toBeNull();
  });
  it("未知的供應商回 null", () => {
    expect(storageConfig({ MEDIA_STORAGE: "dropbox" })).toBeNull();
  });
});
