import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, ROOM_ID_RE, checkVideo, cleanNote, newRoomId, roomProgress, roomStage, secondsBetween, videoExt } from "./types";

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

describe("轉換進度（roomStage／roomProgress）", () => {
  const at = "2026-11-03T06:00:00Z", now = Date.parse("2026-11-03T06:01:00Z");
  const room = (status: "queued" | "running" | "ready" | "failed", step: string | null = null) => ({ status, step, createdAt: at });

  it("worker 回報的步驟對到 6 步之一", () => {
    expect(roomStage(room("running", "下載影片"), now).index).toBe(1);
    expect(roomStage(room("running", "抽影格"), now).index).toBe(1);
    expect(roomStage(room("running", "相機定位 (glomap)"), now).index).toBe(2);
    expect(roomStage(room("running", "訓練 splat (brush)"), now).index).toBe(3);
    expect(roomStage(room("running", "Grounding DINO + SAM 2"), now).index).toBe(4);
    expect(roomStage(room("running", "打包網站"), now).index).toBe(4);
    expect(roomStage(room("running", "上傳成果"), now).index).toBe(5);
  });

  it("列表文字：處理中、失敗、完成、排隊逾時", () => {
    expect(roomProgress(room("running", "訓練 splat (brush)"), now)).toEqual({ text: "4/6 訓練 3D 畫面・轉換中", tone: "warn" });
    expect(roomProgress(room("failed", "相機定位 (glomap)"), now)).toEqual({ text: "相機定位失敗", tone: "danger" });
    expect(roomProgress(room("ready"), now)).toEqual({ text: "完成", tone: "" });
    expect(roomProgress(room("queued"), now).text).toBe("排隊中");
    expect(roomProgress(room("queued"), now + 2 * 60 * 1000).text).toBe("排隊逾時");
  });

  it("耗時和備註", () => {
    expect(secondsBetween("2026-11-03T03:20:17Z", "2026-11-03T03:35:26Z")).toBe(909);
    expect(secondsBetween(null, at)).toBeNull();
    expect(cleanNote("  ")).toBeNull();
    expect(cleanNote(" 有拍到沙發 ")).toBe("有拍到沙發");
    expect(cleanNote("x".repeat(201))).toBeUndefined();
    expect(cleanNote(3)).toBeUndefined();
  });
});
