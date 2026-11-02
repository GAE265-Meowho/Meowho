import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, ROOM_ID_RE, checkVideo, newRoomId, videoExt } from "./types";

describe("影片上傳規則", () => {
  it("接受 mp4 和 mov", () => {
    expect(videoExt("video/mp4")).toBe("mp4");
    expect(videoExt("video/quicktime")).toBe("mov");
  });

  it("拒絕其他格式和空檔", () => {
    expect(checkVideo("image/png", 100)).toBe("video_invalid");
    expect(checkVideo("video/mp4", 0)).toBe("video_invalid");
  });

  it("超過上限回 video_too_large，剛好上限可傳", () => {
    expect(checkVideo("video/mp4", MAX_VIDEO_BYTES + 1)).toBe("video_too_large");
    expect(checkVideo("video/mp4", MAX_VIDEO_BYTES)).toBeNull();
  });

  it("房間 ID 符合資料表格式", () => {
    const id = newRoomId(new Date(2026, 10, 2, 9, 5, 7));
    expect(id).toBe("room_20261102_090507");
    expect(id).toMatch(ROOM_ID_RE);
  });
});
