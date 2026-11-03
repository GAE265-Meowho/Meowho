// 平面圖轉換（#138）共用規則
import { describe, expect, it } from "vitest";
import {
  addRoom, canRead, checkPlan, cleanName, defaultRoomName, houseStatus, isDefaultRoomName, isHouseId, isOwnPlanPath, MAX_ROOMS, planPath, readMeta, removeRoom, renameRoom, reserveRoomKey,
  type PlanRoom,
} from "./types";

const room = (id: string, over: Partial<PlanRoom> = {}): PlanRoom =>
  ({ id, name: "客廳", image_path: `floorplans/room_20261102_220000/${id}.png`, status: "uploaded", created_at: "2026-11-02T14:00:00Z", ...over });

describe("checkPlan（Q9：只收 JPG、PNG，≤ 10 MB）", () => {
  it("JPG、PNG 可以；PDF、HEIC、空檔不行；超過 10 MB 太大", () => {
    expect(checkPlan("image/png", 1000)).toBeNull();
    expect(checkPlan("image/jpeg", 1000)).toBeNull();
    expect(checkPlan("application/pdf", 1000)).toBe("plan_invalid");
    expect(checkPlan("image/heic", 1000)).toBe("plan_invalid");
    expect(checkPlan("image/png", 0)).toBe("plan_invalid");
    expect(checkPlan("image/png", 10 * 1024 * 1024 + 1)).toBe("plan_too_large");
  });
});

describe("路徑與名稱", () => {
  it("原圖路徑固定在 floorplans/<戶>/<房間>，瀏覽器送來的路徑要對得上", () => {
    const H = "room_20261102_220000";
    expect(planPath(H, "r1", "png")).toBe(`floorplans/${H}/r1.png`);
    expect(isOwnPlanPath(H, "r1", `floorplans/${H}/r1.jpg`)).toBe(true);
    expect(isOwnPlanPath(H, "r1", `floorplans/${H}/r2.jpg`)).toBe(false);
    expect(isOwnPlanPath(H, "r1", `floorplans/room_20261102_220001/r1.jpg`)).toBe(false);
    expect(isOwnPlanPath(H, "r1", `floorplans/${H}/../x/r1.jpg`)).toBe(false);
  });
  it("戶 id 沿用房間 id 格式", () => {
    expect(isHouseId("room_20261102_220000")).toBe(true);
    expect(isHouseId("../room")).toBe(false);
  });
  it("名稱 1–40 字，去頭尾空白", () => {
    expect(cleanName("  小美家 ")).toBe("小美家");
    expect(cleanName("  ")).toBeNull();
    expect(cleanName("x".repeat(41))).toBeNull();
    expect(cleanName(3)).toBeNull();
  });
});

describe("meta.rooms", () => {
  it("讀不懂的 meta 當作沒有房間；next 至少比現有編號大", () => {
    expect(readMeta(null)).toEqual({ version: 1, next: 1, rooms: [] });
    expect(readMeta({ rooms: "x" })).toEqual({ version: 1, next: 1, rooms: [] });
    expect(readMeta({ rooms: [room("r3"), { id: "../x", image_path: "a" }] })).toMatchObject({ next: 4, rooms: [{ id: "r3" }] });
  });
  it("保留編號後才能加入；刪掉的編號不重用", () => {
    let meta = readMeta({});
    const a = reserveRoomKey(meta);
    expect(a.id).toBe("r1");
    expect(addRoom(meta, room("r1"))).toBe("room_invalid");  // 沒保留過
    meta = addRoom(a.meta, room(a.id)) as typeof meta;
    expect(addRoom(meta, room("r1"))).toBe("room_invalid");  // 重複
    meta = removeRoom(meta, "r1").meta;
    expect(reserveRoomKey(meta).id).toBe("r2");
  });
  it(`一戶最多 ${MAX_ROOMS} 間`, () => {
    let meta = readMeta({});
    for (let i = 0; i < MAX_ROOMS; i++) {
      const r = reserveRoomKey(meta);
      meta = addRoom(r.meta, room(r.id)) as typeof meta;
    }
    const r = reserveRoomKey(meta);
    expect(addRoom(r.meta, room(r.id))).toBe("too_many_rooms");
  });
  it("刪除回傳被刪的房間（要一併刪原圖）；改名找不到回 null；預設名稱依序編號", () => {
    const meta = { version: 1 as const, next: 3, rooms: [room("r1"), room("r2", { name: "主臥" })] };
    expect(removeRoom(meta, "r2").removed?.name).toBe("主臥");
    expect(removeRoom(meta, "r9").removed).toBeNull();
    expect(renameRoom(meta, "r1", "書房")?.rooms[0].name).toBe("書房");
    expect(renameRoom(meta, "r9", "書房")).toBeNull();
    expect(defaultRoomName(meta)).toBe("房間 3");
  });
});

describe("讀圖狀態（#138 PR 3）", () => {
  const now = new Date("2026-11-03T02:00:00Z");
  it("戶的狀態：有房讀圖中或待讀圖 → running；有失敗 → failed；其他（含沒有房間）→ ready", () => {
    const m = (...rooms: PlanRoom[]) => ({ version: 1 as const, next: 9, rooms });
    expect(houseStatus(m())).toBe("ready");
    expect(houseStatus(m(room("r1", { status: "ready" }), room("r2", { status: "reading" })))).toBe("running");
    expect(houseStatus(m(room("r1", { status: "uploaded" }), room("r2", { status: "failed" })))).toBe("running");
    expect(houseStatus(m(room("r1", { status: "ready" }), room("r2", { status: "failed" })))).toBe("failed");
  });
  it("讀圖中 3 分鐘內不能重新讀；超過或沒有開始時間視為中斷；其他狀態都可以", () => {
    expect(canRead(room("r1", { status: "reading", read_started_at: "2026-11-03T01:58:00Z" }), now)).toBe(false);
    expect(canRead(room("r1", { status: "reading", read_started_at: "2026-11-03T01:56:00Z" }), now)).toBe(true);
    expect(canRead(room("r1", { status: "reading" }), now)).toBe(true);
    for (const status of ["uploaded", "ready", "failed"] as const) expect(canRead(room("r1", { status }), now)).toBe(true);
  });
  it("預設房名（房間 N）才會被 AI 讀出的房名取代", () => {
    expect(isDefaultRoomName("房間 3")).toBe(true);
    expect(isDefaultRoomName("客廳")).toBe(false);
    expect(isDefaultRoomName("房間 3 號")).toBe(false);
  });
});
