import { describe, expect, it } from "vitest";
import {
  MAX_TRAILER_VIDEO_BYTES, checkTrailerVideo, compositeShots, groupTrailerVideos, isVideoSlot, trailerVideoFileName, trailerVideoPath, videoSlotLabel, videoSlots,
} from "./trailer-video";

describe("前導影片的影片檔（#501）", () => {
  it("兩格以上或拆成多支短片的鏡頭有整鏡成品格 m-<第一格代號>（#548）", () => {
    const m = videoSlots().filter(x => x.kind === "shot");
    expect(m.map(x => x.id)).toEqual(["m-s07", "m-s12", "m-s10", "m-s14", "m-s15", "m-s16", "m-s26"]);
    expect(videoSlotLabel("m-s16")).toBe("鏡 12 整鏡成品");
    expect(compositeShots().find(c => c.id === "m-s16")!.shot.no).toBe(12);
    expect(isVideoSlot("m-s16")).toBe(true);
  });

  it("可放影片的格：完整影片 1、四段 4、AI 片段 26、旁白 25", () => {
    const s = videoSlots();
    expect(s.filter(x => x.kind === "full")).toHaveLength(1);
    expect(s.filter(x => x.kind === "section").map(x => x.id)).toEqual(["opening", "cross", "product", "ending"]);
    expect(s.filter(x => x.kind === "clip")).toHaveLength(26);
    expect(s.filter(x => x.kind === "voice")).toHaveLength(25);
    expect(s.filter(x => x.kind === "rec")).toHaveLength(10); // 第三段系統錄影（#529）
    expect(isVideoSlot("s07-2")).toBe(true);
    expect(isVideoSlot("s08")).toBe(false); // 字卡不用生成
    expect(isVideoSlot("../x")).toBe(false);
  });

  it("上傳檢查：格、格式、大小", () => {
    expect(checkTrailerVideo({ slot: "full", mime: "video/mp4", sizeBytes: 300_000_000 })).toBeNull();
    expect(checkTrailerVideo({ slot: "n03", mime: "audio/mpeg", sizeBytes: 100_000 })).toBeNull();
    expect(checkTrailerVideo({ slot: "n03", mime: "video/mp4", sizeBytes: 100_000 })).toBe("unsupported_type");
    expect(checkTrailerVideo({ slot: "full", mime: "audio/mpeg", sizeBytes: 100_000 })).toBe("unsupported_type");
    expect(checkTrailerVideo({ slot: "nope", mime: "video/mp4", sizeBytes: 1 })).toBe("invalid_slot");
    expect(checkTrailerVideo({ slot: "s01", mime: "image/png", sizeBytes: 1 })).toBe("unsupported_type");
    expect(checkTrailerVideo({ slot: "s01", mime: "video/mp4", sizeBytes: 0 })).toBe("invalid_size");
    expect(checkTrailerVideo({ slot: "s01", mime: "video/mp4", sizeBytes: MAX_TRAILER_VIDEO_BYTES + 1 })).toBe("too_large");
  });

  it("路徑帶格與 UTC 時間戳", () => {
    expect(trailerVideoPath("opening", "video/quicktime", new Date("2026-11-18T15:30:05Z"))).toBe("videos/trailer/opening/20261118153005.mov");
    expect(trailerVideoPath("n03", "audio/mpeg", new Date("2026-11-18T15:30:05Z"))).toBe("videos/trailer/n03/20261118153005.mp3");
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
    expect(videoSlotLabel("rec-find")).toBe("鏡 16 系統錄影 幫我找貓");
    expect(trailerVideoPath("rec-play", "video/mp4", new Date("2026-11-19T08:00:00Z"))).toBe("videos/trailer/rec-play/20261119080000.mp4");
    expect(videoSlotLabel("opening")).toBe("第一段遺棄開場");
    expect(videoSlotLabel("s07-1")).toBe("鏡 5-1 拍小橘吃飯");
    expect(videoSlotLabel("s01")).toBe("鏡 1");
    expect(videoSlotLabel("n03")).toBe("旁白 n03 小橘");
  });

  it("下載檔名", () => {
    expect(trailerVideoFileName("s07-1", "鏡 6-1 拍小橘吃飯", { path: "videos/trailer/s07-1/20261118100000.mp4", at: "2026-11-18T10:00:00Z" }))
      .toBe("前導影片_鏡6-1拍小橘吃飯_2026-11-18.mp4");
    expect(trailerVideoFileName("n03", "旁白 n03 小橘", { path: "videos/trailer/n03/20261118100000.mp3", at: "2026-11-18T10:00:00Z" })).toBe("n03_小橘.mp3");
  });
});
