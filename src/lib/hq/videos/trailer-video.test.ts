import { describe, expect, it } from "vitest";
import {
  MAX_TRAILER_VIDEO_BYTES, checkTrailerVideo, groupTrailerVideos, isVideoSlot, trailerVideoFileName, trailerVideoPath, videoSlotLabel, videoSlots,
} from "./trailer-video";

describe("前導影片的影片檔（#501）", () => {
  it("可放影片的格：完整影片 1、四段 4、AI 片段 27", () => {
    const s = videoSlots();
    expect(s.filter(x => x.kind === "full")).toHaveLength(1);
    expect(s.filter(x => x.kind === "section").map(x => x.id)).toEqual(["opening", "cross", "product", "ending"]);
    expect(s.filter(x => x.kind === "clip")).toHaveLength(27);
    expect(isVideoSlot("s07-2")).toBe(true);
    expect(isVideoSlot("s08")).toBe(false); // 字卡不用生成
    expect(isVideoSlot("../x")).toBe(false);
  });

  it("上傳檢查：格、格式、大小", () => {
    expect(checkTrailerVideo({ slot: "full", mime: "video/mp4", sizeBytes: 300_000_000 })).toBeNull();
    expect(checkTrailerVideo({ slot: "nope", mime: "video/mp4", sizeBytes: 1 })).toBe("invalid_slot");
    expect(checkTrailerVideo({ slot: "s01", mime: "image/png", sizeBytes: 1 })).toBe("unsupported_type");
    expect(checkTrailerVideo({ slot: "s01", mime: "video/mp4", sizeBytes: 0 })).toBe("invalid_size");
    expect(checkTrailerVideo({ slot: "s01", mime: "video/mp4", sizeBytes: MAX_TRAILER_VIDEO_BYTES + 1 })).toBe("too_large");
  });

  it("路徑帶格與 UTC 時間戳", () => {
    expect(trailerVideoPath("opening", "video/quicktime", new Date("2026-11-18T15:30:05Z"))).toBe("videos/trailer/opening/20261118153005.mov");
  });

  it("整理版本：每格新到舊，不認得的略過", () => {
    const g = groupTrailerVideos([
      "videos/trailer/full/20261118100000.mp4",
      "videos/trailer/full/20261119100000.mp4",
      "videos/trailer/s02/20261118120000.webm",
      "videos/trailer/s08/20261118120000.mp4",
      "videos/trailer/full/bad.mp4",
      "homes/x/videos/1.mp4",
    ]);
    expect(Object.keys(g).sort()).toEqual(["full", "s02"]);
    expect(g.full.map(v => v.at)).toEqual(["2026-11-19T10:00:00Z", "2026-11-18T10:00:00Z"]);
  });

  it("顯示名稱", () => {
    expect(videoSlotLabel("full")).toBe("完整版");
    expect(videoSlotLabel("opening")).toBe("第一段遺棄開場");
    expect(videoSlotLabel("s07-1")).toBe("鏡 7-1 拍小橘吃飯");
    expect(videoSlotLabel("s01")).toBe("鏡 1");
  });

  it("下載檔名", () => {
    expect(trailerVideoFileName("s07-1", "鏡 7-1 拍小橘吃飯", { path: "videos/trailer/s07-1/20261118100000.mp4", at: "2026-11-18T10:00:00Z" }))
      .toBe("前導影片_鏡7-1拍小橘吃飯_2026-11-18.mp4");
  });
});
