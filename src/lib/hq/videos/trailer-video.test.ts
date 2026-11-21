import { describe, expect, it } from "vitest";
import {
  DUB_SLOTS, MAX_TRAILER_VIDEO_BYTES, SUB_SLOTS, subtitleMime, checkTrailerVideo, compositeShots, groupTrailerVideos, isVideoSlot, trailerVideoFileName, trailerVideoPath, videoSlotLabel, videoSlots,
} from "./trailer-video";

describe("前導影片的影片檔（#501）", () => {
  it("兩格以上或拆成多支短片的鏡頭有整鏡成品格 m-<第一格代號>（#548）", () => {
    const m = videoSlots().filter(x => x.kind === "shot");
    expect(m.map(x => x.id)).toEqual(["m-s07", "m-s08", "m-s12", "m-s10", "m-s14", "m-s15", "m-s16", "m-s26"]);
    expect(videoSlotLabel("m-s16")).toBe("鏡 12 整鏡成品");
    expect(compositeShots().find(c => c.id === "m-s16")!.shot.no).toBe(12);
    expect(isVideoSlot("m-s16")).toBe(true);
  });

  it("可放影片的格：完整影片 1、四段 4、片段 33（AI 28＋第三段系統錄影 5，#547）、旁白 29（#578 n26、#588 n27–n29）", () => {
    const s = videoSlots();
    expect(s.filter(x => x.kind === "full").map(x => x.id)).toEqual(["full", "demo"]); // #565
    expect(s.filter(x => x.kind === "section").map(x => x.id)).toEqual(["opening", "cross", "product", "ending"]);
    expect(s.filter(x => x.kind === "clip")).toHaveLength(33);
    for (const id of ["s21", "s23", "s24", "s25", "s27"]) expect(isVideoSlot(id), id).toBe(true);
    expect(s.filter(x => x.kind === "voice")).toHaveLength(29);
    expect(isVideoSlot("n26")).toBe(true);
    expect(s.filter(x => x.kind === "rec")).toHaveLength(10); // 第三段系統錄影（#529）
    expect(isVideoSlot("s07-2")).toBe(true);
    expect(isVideoSlot("s08-1")).toBe(true); // #562 鏡 6 改 AI 生成
    expect(isVideoSlot("../x")).toBe(false);
  });

  it("已配音的影片：完整影片兩支＋四段各一格，跟無聲剪輯版分開", () => {
    const d = videoSlots().filter(x => x.kind === "dub").map(x => x.id);
    expect(d).toEqual(["dub-full", "dub-demo", "dub-opening", "dub-cross", "dub-product", "dub-ending"]);
    expect(DUB_SLOTS.map(x => x.id)).toEqual(d);
    expect(videoSlotLabel("dub-full")).toBe("前導影片（已配音）");
    expect(videoSlotLabel("dub-cross")).toBe("第二段交叉敘事（已配音）");
    expect(checkTrailerVideo({ slot: "dub-full", mime: "video/mp4", sizeBytes: 70_000_000 })).toBeNull();
    expect(checkTrailerVideo({ slot: "dub-full", mime: "audio/mpeg", sizeBytes: 100_000 })).toBe("unsupported_type");
    const g = groupTrailerVideos(["videos/trailer/dub-full/20261120090000.mp4"]);
    expect(trailerVideoFileName("dub-full", videoSlotLabel("dub-full"), g["dub-full"][0])).toBe("前導影片_已配音_2026-11-20.mp4");
    expect(trailerVideoFileName("dub-cross", videoSlotLabel("dub-cross"), { path: "videos/trailer/dub-cross/20261120090000.mp4", at: "2026-11-20T09:00:00Z" }))
      .toBe("前導影片_第二段交叉敘事_已配音_2026-11-20.mp4");
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
    expect(videoSlotLabel("full")).toBe("前導影片");
    expect(videoSlotLabel("demo")).toBe("系統 Demo 影片");
    expect(isVideoSlot("demo")).toBe(true);
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

describe("字幕檔（#586）", () => {
  it("已配音的六支影片各有一格字幕 sub-<格>，收 SRT／VTT", () => {
    expect(SUB_SLOTS.map(s => s.id)).toEqual(["sub-full", "sub-demo", "sub-opening", "sub-cross", "sub-product", "sub-ending"]);
    for (const s of SUB_SLOTS) expect(isVideoSlot(s.id)).toBe(true);
    expect(checkTrailerVideo({ slot: "sub-ending", mime: "application/x-subrip", sizeBytes: 282 })).toBeNull();
    expect(checkTrailerVideo({ slot: "sub-ending", mime: "text/vtt", sizeBytes: 282 })).toBeNull();
    expect(checkTrailerVideo({ slot: "sub-ending", mime: "video/mp4", sizeBytes: 282 })).toBe("unsupported_type");
    expect(checkTrailerVideo({ slot: "dub-ending", mime: "application/x-subrip", sizeBytes: 282 })).toBe("unsupported_type");
    expect(trailerVideoPath("sub-ending", "application/x-subrip", new Date("2026-11-21T11:40:00Z"))).toBe("videos/trailer/sub-ending/20261121114000.srt");
  });

  it("瀏覽器讀不到 .srt 的類型時，依副檔名補上", () => {
    expect(subtitleMime({ name: "第四段_相遇結尾.srt", type: "" })).toBe("application/x-subrip");
    expect(subtitleMime({ name: "a.VTT", type: "" })).toBe("text/vtt");
    expect(subtitleMime({ name: "a.srt", type: "application/x-subrip" })).toBe("application/x-subrip");
    expect(subtitleMime({ name: "a.txt", type: "text/plain" })).toBe("text/plain");
  });

  it("版本、名稱、下載檔名", () => {
    const g = groupTrailerVideos(["videos/trailer/sub-ending/20261121114000.srt", "videos/trailer/sub-full/20261121114000.vtt"]);
    expect(Object.keys(g).sort()).toEqual(["sub-ending", "sub-full"]);
    expect(videoSlotLabel("sub-ending")).toBe("第四段相遇結尾（字幕）");
    expect(videoSlotLabel("sub-full")).toBe("前導影片（字幕）");
    const v = { path: "videos/trailer/sub-ending/20261121114000.srt", at: "2026-11-21T11:40:00Z" };
    expect(trailerVideoFileName("sub-ending", videoSlotLabel("sub-ending"), v)).toBe("前導影片_第四段相遇結尾_字幕_2026-11-21.srt");
    expect(trailerVideoFileName("sub-full", videoSlotLabel("sub-full"), { ...v, path: "videos/trailer/sub-full/20261121114000.srt" })).toBe("前導影片_字幕_2026-11-21.srt");
  });
});
