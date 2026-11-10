import { describe, expect, it } from "vitest";
import * as homeRoom from "./home-room";
import { checkHomeVideo, homeTools, homeVideoPath, isHomeVideoPath, MAX_HOME_VIDEO_BYTES, MAX_HOME_VIDEO_SEC, safetyBusyLabel, safetyRecords, UPLOAD_PRIVACY, demoReportRow } from "./home-room";

const room = (status: string, completed_at: string | null = null) => ({ status, completed_at });
const report = (status: string, room_model_id: string | null = null, created_at = "2026-11-04T00:00:00Z", items: unknown[] = []) =>
  ({ id: created_at, status, room_model_id, created_at, items });

describe("喵戶卡片的兩顆按鈕（規格 09 §7.2 狀態表）", () => {
  it("都還沒做：生成 3D 環境、居家安全檢測", () => {
    expect(homeTools([], [])).toEqual({
      scene: { label: "生成 3D 環境", state: "start" },
      safety: { label: "居家安全檢測", state: "start" },
    });
  });
  it("3D 房間處理中：兩顆一起停用（建模同時在產生報告）", () => {
    for (const status of ["queued", "running"]) {
      expect(homeTools([room(status)], [])).toEqual({
        scene: { label: "3D 房間處理中", state: "busy" },
        safety: { label: "安全檢測處理中", state: "busy" },
      });
    }
    // 之前有報告也一樣停用
    expect(homeTools([room("running")], [report("ready")]).safety.state).toBe("busy");
  });
  it("單獨檢測處理中：第一顆照常、第二顆停用", () => {
    expect(homeTools([], [report("queued")])).toEqual({
      scene: { label: "生成 3D 環境", state: "start" },
      safety: { label: "安全檢測處理中", state: "busy" },
    });
    expect(homeTools([], [report("running")]).safety.state).toBe("busy");
  });
  it("3D 房間已完成：查看模型、查看報告", () => {
    expect(homeTools([room("ready", "2026-11-04T01:00:00Z")], [report("ready", "room_20261104_010000")])).toEqual({
      scene: { label: "查看模型", state: "view" },
      safety: { label: "查看報告", state: "view" },
    });
  });
  it("房間轉好還沒按完成，也是查看模型（去預覽）", () => {
    expect(homeTools([room("ready")], []).scene).toEqual({ label: "查看模型", state: "view" });
  });
  it("只做過單獨檢測：生成 3D 環境、查看報告", () => {
    expect(homeTools([], [report("ready")])).toEqual({
      scene: { label: "生成 3D 環境", state: "start" },
      safety: { label: "查看報告", state: "view" },
    });
  });
  it("建房間時的報告失敗：第二顆維持居家安全檢測", () => {
    expect(homeTools([room("ready", "2026-11-04T01:00:00Z")], [report("failed", "room_20261104_010000")]).safety)
      .toEqual({ label: "居家安全檢測", state: "start" });
  });
  it("有任何一份產生好的報告就是查看報告（再檢測一次處理中也一樣）", () => {
    expect(homeTools([], [report("ready"), report("running")]).safety).toEqual({ label: "查看報告", state: "view" });
  });
  it("房間處理失敗：回到生成 3D 環境", () => {
    expect(homeTools([room("failed")], []).scene).toEqual({ label: "生成 3D 環境", state: "start" });
  });
});

describe("檢測紀錄（規格 09 §7.2）", () => {
  it("ready 報告旁有另一筆舊 queued 時，仍標示已有報告可查看", () => {
    const reports = [report("ready"), report("queued", null, "2026-11-05T00:00:00Z")];
    expect(safetyRecords(reports)).toHaveLength(1);
    expect(homeTools([], reports).safety.label).toBe("查看報告");
    expect(safetyBusyLabel(true)).toBe("另有安全檢測處理中");
    expect(safetyBusyLabel(false)).toBe("安全檢測處理中");
  });

  it("只列產生好的報告，最新在前，標出來源與風險項目數量", () => {
    const list = safetyRecords([
      report("ready", null, "2026-11-01T00:00:00Z", [{}, {}]),
      report("failed", null, "2026-11-02T00:00:00Z"),
      report("ready", "room_20261103_000000", "2026-11-03T00:00:00Z", [{}]),
    ]);
    expect(list.map(r => [r.created_at, r.source, r.riskCount])).toEqual([
      ["2026-11-03T00:00:00Z", "建立 3D 房間時", 1],
      ["2026-11-01T00:00:00Z", "單獨檢測", 2],
    ]);
  });
  it("items 不是陣列時當作 0 項", () => {
    expect(safetyRecords([{ ...report("ready"), items: null as unknown as unknown[] }])[0].riskCount).toBe(0);
  });
});

describe("建立 3D 房間不再詢問環境檢查（v0.6）", () => {
  it("上傳前只有隱私說明", () => {
    expect(UPLOAD_PRIVACY).toBe("我們會用影片或照片建立你家的 3D 房間，同時檢查家裡對貓安不安全。處理完就會刪除原始檔，只留房間和安全報告。");
  });
  it("拿掉環境檢查的詢問流程", () => {
    expect("envNext" in homeRoom).toBe(false);
    expect("isEnvCheck" in homeRoom).toBe(false);
  });
});

describe("示範報告（AI 環境安全檢查接上前）", () => {
  it("單獨檢測與建立 3D 房間時都產生產生好的報告，檢測紀錄分得出來源", () => {
    const now = new Date(Date.UTC(2026, 10, 4, 6));
    const alone = demoReportRow("h1", null, now);
    const room = demoReportRow("h1", "room_20261104_060000", new Date(now.getTime() + 1000));
    expect(alone).toMatchObject({ household_id: "h1", status: "ready", room_model_id: null });
    const recs = safetyRecords([{ id: "a", ...alone }, { id: "b", ...room }]);
    expect(recs.map(r => `${r.id}:${r.source}:${r.riskCount}`)).toEqual(["b:建立 3D 房間時:5", "a:單獨檢測:5"]);
    expect(homeTools([], [alone]).safety.label).toBe("查看報告");
  });
});

describe("飼主上傳的影片路徑（Azure，#273）", () => {
  const home = "11111111-2222-3333-4444-555555555555";
  const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  it("路徑是 homes/<喵戶>/videos/<影片 id>.<mp4|mov>", () => {
    expect(homeVideoPath(home, uuid, "video/mp4")).toBe(`homes/${home}/videos/${uuid}.mp4`);
    expect(homeVideoPath(home, uuid, "video/quicktime")).toBe(`homes/${home}/videos/${uuid}.mov`);
  });
  it("只接受這個喵戶底下的 uuid.mp4／mov", () => {
    expect(isHomeVideoPath(home, `homes/${home}/videos/${uuid}.mp4`)).toBe(true);
    expect(isHomeVideoPath(home, `homes/${home}/videos/${uuid}.mov`)).toBe(true);
    expect(isHomeVideoPath(home, `${home}/${uuid}.mp4`)).toBe(false);  // 舊的 Supabase 路徑
    expect(isHomeVideoPath(home, `homes/other/videos/${uuid}.mp4`)).toBe(false);
    expect(isHomeVideoPath(home, `homes/${home}/videos/../x/${uuid}.mp4`)).toBe(false);
    expect(isHomeVideoPath(home, `homes/${home}/videos/${uuid}.webm`)).toBe(false);
    expect(isHomeVideoPath(home, null)).toBe(false);
  });
});

describe("影片限制（#243：mp4／mov、300 MB、180 秒）", () => {
  const ok = { mime: "video/mp4", sizeBytes: 30 * 1024 * 1024, durationSec: 111 };
  it("合規的影片通過", () => {
    expect(checkHomeVideo(ok)).toBeNull();
    expect(checkHomeVideo({ ...ok, mime: "video/quicktime", sizeBytes: MAX_HOME_VIDEO_BYTES, durationSec: MAX_HOME_VIDEO_SEC })).toBeNull();
  });
  it("格式、大小、長度不對都擋下", () => {
    expect(checkHomeVideo({ ...ok, mime: "video/webm" })).toBe("unsupported_type");
    expect(checkHomeVideo({ ...ok, mime: undefined })).toBe("unsupported_type");
    expect(checkHomeVideo({ ...ok, sizeBytes: MAX_HOME_VIDEO_BYTES + 1 })).toBe("too_large");
    expect(checkHomeVideo({ ...ok, sizeBytes: 0 })).toBe("too_large");
    expect(checkHomeVideo({ ...ok, durationSec: MAX_HOME_VIDEO_SEC + 0.5 })).toBe("too_long");
    expect(checkHomeVideo({ ...ok, durationSec: 0 })).toBe("invalid_duration");
    expect(checkHomeVideo({ ...ok, durationSec: "111" })).toBe("invalid_duration");
  });
});
