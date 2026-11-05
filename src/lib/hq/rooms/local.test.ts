import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalRoom, listLocalRooms, localResultPath, localRoomRoot } from "./local";

let root: string;
const video = { name: "我的房間", type: "video/mp4", data: new Uint8Array([1, 2, 3]) };

beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "rooms-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("房間本機模式", () => {
  it("正式環境不啟用", () => {
    expect(localRoomRoot({ NODE_ENV: "production", ROOM_LOCAL_ROOT: "/x" })).toBeNull();
    expect(localRoomRoot({ NODE_ENV: "development", ROOM_LOCAL_ROOT: "/x" })).toBe("/x");
    expect(localRoomRoot({ NODE_ENV: "development" })).toBeNull();
  });

  it("建立房間時存影片並排隊", async () => {
    const r = await createLocalRoom(root, video, new Date(2026, 10, 2, 9, 0, 0));
    expect(r).toEqual({ ok: true, id: "room_20261102_090000" });
    expect(await readdir(path.join(root, "room_20261102_090000"))).toEqual(["room.json", "source.mp4"]);
    expect(await readFile(path.join(root, "room_20261102_090000", "source.mp4"))).toHaveLength(3);
    expect(await listLocalRooms(root)).toMatchObject([{ name: "我的房間", status: "queued", note: null, thumbUrl: null }]);
  });

  it("存備註，太長不建立", async () => {
    await createLocalRoom(root, { ...video, note: " 有拍到沙發 " });
    expect(await listLocalRooms(root)).toMatchObject([{ note: "有拍到沙發" }]);
    expect(await createLocalRoom(root, { ...video, note: "x".repeat(201) })).toEqual({ ok: false, code: "note_too_long" });
  });

  it("完成且有縮圖時給縮圖網址", async () => {
    const { id } = await createLocalRoom(root, video) as { id: string };
    const state = path.join(root, id, "room.json");
    await writeFile(state, JSON.stringify({ ...JSON.parse(await readFile(state, "utf8")), status: "ready" }));
    await mkdir(path.join(root, id, "result"));
    await writeFile(path.join(root, id, "result", "thumb.jpg"), "x");
    expect(await listLocalRooms(root)).toMatchObject([{ resultBase: `/api/hq/rooms/local/${id}`, thumbUrl: `/api/hq/rooms/local/${id}/thumb.jpg` }]);
  });

  it("名稱空白或影片不合格時不建立", async () => {
    expect(await createLocalRoom(root, { ...video, name: "  " })).toEqual({ ok: false, code: "name_required" });
    expect(await createLocalRoom(root, { ...video, type: "image/png" })).toEqual({ ok: false, code: "video_invalid" });
    expect(await readdir(root)).toEqual([]);
  });

  it("成果路徑不能跳出 result", () => {
    expect(localResultPath(root, "room_20261102_090000", ["objects", "room_cut.splat"]))
      .toBe(path.join(root, "room_20261102_090000", "result", "objects", "room_cut.splat"));
    expect(localResultPath(root, "room_20261102_090000", ["..", "source.mp4"])).toBeNull();
    expect(localResultPath(root, "../x", ["scene.json"])).toBeNull();
  });
});
