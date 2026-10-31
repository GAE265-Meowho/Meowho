import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memory";
import { catVideoPath, prepareCatVideoUpload, removeMedia, validateVideoUpload, MAX_VIDEO_BYTES } from "./media";

const ok = { mime: "video/mp4", sizeBytes: 20_000_000, durationSec: 30 };

describe("影片上傳檢查", () => {
  it("合格的影片通過", () => expect(validateVideoUpload(ok, 0)).toBeNull());
  it("超過 60 秒", () => expect(validateVideoUpload({ ...ok, durationSec: 61 }, 0)).toBe("too_long"));
  it("秒數不合理", () => expect(validateVideoUpload({ ...ok, durationSec: 0 }, 0)).toBe("invalid_duration"));
  it("檔案太大", () => expect(validateVideoUpload({ ...ok, sizeBytes: MAX_VIDEO_BYTES + 1 }, 0)).toBe("too_large"));
  it("不支援的格式", () => expect(validateVideoUpload({ ...ok, mime: "video/avi" }, 0)).toBe("unsupported_type"));
  it("已經有 3 支", () => expect(validateVideoUpload(ok, 3)).toBe("too_many_videos"));
});

describe("儲存路徑：只存路徑，不存網址（決策 006）", () => {
  it("依貓咪分資料夾，副檔名跟著格式", () => {
    expect(catVideoPath("cat-1", "abc", "video/quicktime")).toBe("cats/cat-1/videos/abc.mov");
  });
  it("貓咪 id 不能帶路徑字元", () => {
    expect(() => catVideoPath("../x", "abc", "video/mp4")).toThrow();
  });
});

describe("準備上傳（記憶體版儲存）", () => {
  it("回傳路徑與有時效的上傳網址", async () => {
    const store = createMemoryStore();
    const r = await prepareCatVideoUpload(store, { catId: "cat-1", existingCount: 0, ...ok }, () => "abc");
    expect(r).toEqual({
      ok: true, path: "cats/cat-1/videos/abc.mp4",
      upload: { url: expect.stringContaining("cats/cat-1/videos/abc.mp4"), headers: { "content-type": "video/mp4" } },
    });
  });
  it("不合格就不簽發網址", async () => {
    const store = createMemoryStore();
    expect(await prepareCatVideoUpload(store, { catId: "cat-1", existingCount: 3, ...ok }, () => "abc")).toEqual({ ok: false, error: "too_many_videos" });
  });
});

describe("記憶體版儲存的行為（與 Azure 版同一介面）", () => {
  it("上傳後讀得到、刪除後讀不到", async () => {
    const store = createMemoryStore();
    await store.put("cats/c/videos/1.mp4", new Uint8Array([1, 2, 3]), "video/mp4");
    expect(await store.download("cats/c/videos/1.mp4")).toEqual(new Uint8Array([1, 2, 3]));
    expect(await store.readUrl("cats/c/videos/1.mp4")).toContain("cats/c/videos/1.mp4");
    await removeMedia(store, ["cats/c/videos/1.mp4", "cats/c/videos/沒這支.mp4"]);
    expect(await store.download("cats/c/videos/1.mp4")).toBeNull();
  });
});
