// 平面圖轉換（#138）資料存取：用記憶體版資料表與儲存模擬，不連線
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/storage/memory";
import type { MediaStore } from "@/lib/storage/types";
import { addRoomPhoto, addUploadedRoom, createHouse, createPhotoUpload, removeRoomPhoto, dbFail, createRoomUpload, deleteHouse, deleteHouseRoom, getHouse, listHouses, renameHouseRoom, startRoomRead, type Db, type Deps, type FloorplanReader } from "./core";
import living from "./fixtures/living-room.json";

type Row = Record<string, unknown>;
let rows: Row[];
let failWrites: boolean;

/** 夠用的假資料表：select／insert／update／delete＋eq，update 要 .select() 才回傳筆數 */
function fakeDb(): Db {
  return {
    from: () => {
      const filters: [string, unknown][] = [];
      const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
      let mode: "select" | "update" | "delete" = "select";
      let patch: Row = {};
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return mode === "delete" ? finishDelete() : q; },
        order: () => q,
        limit: async () => ({ data: rows.filter(match), error: null }),
        maybeSingle: async () => ({ data: rows.find(match) ?? null, error: null }),
        insert: async (row: Row) => {
          if (failWrites) return { error: { code: "42501" } };
          if (rows.some(r => r.id === row.id)) return { error: { code: "23505" } };
          rows.push({ ...row }); return { error: null };
        },
        update: (p: Row) => { mode = "update"; patch = p; return upd; },
        delete: () => { mode = "delete"; return q; },
      };
      const upd = {
        eq: (k: string, v: unknown) => { filters.push([k, v]); return upd; },
        select: async () => {
          if (failWrites) return { data: null, error: { code: "42501" } };
          const hit = rows.filter(match);
          hit.forEach(r => Object.assign(r, patch));
          return { data: hit.map(r => ({ id: r.id })), error: null };
        },
      };
      // delete 需要兩個 eq（id、source）：第二個 eq 才執行
      const finishDelete = () => filters.length < 2 ? q : (async () => {
        if (failWrites) return { error: { code: "42501" } };
        rows = rows.filter(r => !match(r)); return { error: null };
      })();
      return q;
    },
  };
}

let store: MediaStore;
const NOW = new Date(2026, 10, 2, 22, 0, 0);
const deps = (over: Partial<Deps> = {}): Deps => ({ sb: fakeDb(), userId: "u-1", store, now: NOW, ...over });
const H = "room_20261102_220000";

async function upload(houseId = H, name?: string) {
  const t = await createRoomUpload(deps(), houseId, "image/png", 1000);
  if (!t.ok) throw new Error(t.code);
  await store.put(t.path, new Uint8Array([1]), "image/png");  // 模擬瀏覽器 PUT
  return { ticket: t, added: await addUploadedRoom(deps(), houseId, { roomId: t.roomId, path: t.path, name }) };
}

beforeEach(() => { rows = []; failWrites = false; store = createMemoryStore(); });

describe("一戶（Q11：一筆＝一戶）", () => {
  it("建立：source=floorplan、空房間；名稱必填；同一秒兩戶加尾碼", async () => {
    expect(await createHouse(deps(), " ")).toEqual({ ok: false, code: "name_required" });
    expect(await createHouse(deps(), "小美家")).toEqual({ ok: true, id: H });
    expect(await createHouse(deps(), "阿明家")).toEqual({ ok: true, id: `${H}_2` });
    // 連按建立：同名擋下，不會多出一戶
    expect(await createHouse(deps(), " 小美家 ")).toEqual({ ok: false, code: "name_taken" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "floorplan", status: "ready", created_by: "u-1", meta: { version: 1, next: 1, rooms: [] } });
  });
  it("沒有權限（RLS 擋下）：permission_denied", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failWrites = true;
    expect(await createHouse(deps(), "小美家")).toEqual({ ok: false, code: "permission_denied" });
  });
  it("清單只列平面圖的戶，不含影片房間", async () => {
    rows.push({ id: "room_20261101_100000", name: "影片房", source: "video", meta: {}, updated_at: "x" });
    await createHouse(deps(), "小美家");
    await upload();
    rows[1].creator = { display_name: "Tina", email: "t@x" };
    expect(await listHouses(deps())).toEqual({ ok: true, houses: [{ id: H, name: "小美家", roomCount: 1, updatedAt: NOW.toISOString(), createdBy: "Tina",
      rooms: [{ id: "r1", name: "房間 1", status: "uploaded", imageUrl: `memory://read/floorplans/${H}/r1.png` }] }] });
    expect(await getHouse(deps(), "room_20261101_100000")).toBeNull();
  });
});

describe("資料庫錯誤分類", () => {
  it("缺欄位／缺表（0014、0015 沒執行或欄位快取沒更新）：db_not_ready；其他：permission_denied", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const code of ["42P01", "42703", "PGRST204", "PGRST205"]) expect(dbFail({ code }, "t")).toBe("db_not_ready");
    expect(dbFail({ code: "42501" }, "t")).toBe("permission_denied");
    expect(dbFail({}, "t")).toBe("permission_denied");
    quiet.mockRestore();
  });
});

describe("上傳房間平面圖（Q9）", () => {
  beforeEach(async () => { await createHouse(deps(), "小美家"); });

  it("兩步：簽網址（保留 r1）→ 確認已上傳後加入；房名空白用預設，原圖網址可預覽", async () => {
    const { ticket, added } = await upload();
    expect(ticket).toMatchObject({ roomId: "r1", path: `floorplans/${H}/r1.png`, upload: { url: `memory://upload/floorplans/${H}/r1.png` } });
    expect(added).toEqual({ ok: true, roomId: "r1" });
    const house = await getHouse(deps(), H);
    expect(house?.rooms).toEqual([{
      id: "r1", name: "房間 1", image_path: `floorplans/${H}/r1.png`, status: "uploaded", created_at: NOW.toISOString(),
      imageUrl: `memory://read/floorplans/${H}/r1.png`, photoUrls: [],
    }]);
    expect((await upload(H, "主臥")).ticket.roomId).toBe("r2");
    expect((await getHouse(deps(), H))?.rooms.map(r => r.name)).toEqual(["房間 1", "主臥"]);
  });
  it("檔案不對、沒設定 Azure、戶不存在都擋", async () => {
    expect(await createRoomUpload(deps(), H, "application/pdf", 1000)).toEqual({ ok: false, code: "plan_invalid" });
    expect(await createRoomUpload(deps(), H, "image/png", 11 * 1024 * 1024)).toEqual({ ok: false, code: "plan_too_large" });
    expect(await createRoomUpload(deps({ store: null }), H, "image/png", 1000)).toEqual({ ok: false, code: "storage_disabled" });
    expect(await createRoomUpload(deps(), "room_20261102_999999", "image/png", 1000)).toEqual({ ok: false, code: "not_found" });
  });
  it("還沒真的傳上去：upload_missing；路徑不是自己的：room_invalid", async () => {
    const t = await createRoomUpload(deps(), H, "image/png", 1000);
    if (!t.ok) throw new Error();
    expect(await addUploadedRoom(deps(), H, { roomId: t.roomId, path: t.path, name: "" })).toEqual({ ok: false, code: "upload_missing" });
    expect(await addUploadedRoom(deps(), H, { roomId: t.roomId, path: `floorplans/other/r1.png`, name: "" })).toEqual({ ok: false, code: "room_invalid" });
    // 沒保留過的編號（自己猜路徑傳上去）也不收
    await store.put(`floorplans/${H}/r9.png`, new Uint8Array([1]), "image/png");
    expect(await addUploadedRoom(deps(), H, { roomId: "r9", path: `floorplans/${H}/r9.png`, name: "" })).toEqual({ ok: false, code: "room_invalid" });
  });
  it("同一張重複送出：第二次被擋，原圖刪掉", async () => {
    const { ticket } = await upload();
    await store.put(ticket.path, new Uint8Array([2]), "image/png");
    expect(await addUploadedRoom(deps(), H, { roomId: ticket.roomId, path: ticket.path, name: "" })).toEqual({ ok: false, code: "room_invalid" });
    expect(await store.list(`floorplans/${H}/`)).toEqual([]);
  });
  it("一戶最多 8 間", async () => {
    for (let i = 0; i < 8; i++) await upload();
    expect(await createRoomUpload(deps(), H, "image/png", 1000)).toEqual({ ok: false, code: "too_many_rooms" });
  });
  it("改名、刪房間（原圖一併刪，編號不重用）", async () => {
    await upload();
    expect(await renameHouseRoom(deps(), H, "r1", " 客廳 ")).toEqual({ ok: true });
    expect(await renameHouseRoom(deps(), H, "r1", "")).toEqual({ ok: false, code: "name_required" });
    expect(await renameHouseRoom(deps(), H, "r9", "書房")).toEqual({ ok: false, code: "not_found" });
    expect((await getHouse(deps(), H))?.rooms[0].name).toBe("客廳");
    expect(await deleteHouseRoom(deps(), H, "r1")).toEqual({ ok: true });
    expect(await store.list(`floorplans/${H}/`)).toEqual([]);
    expect((await upload()).ticket.roomId).toBe("r2");
  });
  it("刪除一戶：資料列與所有原圖（含上傳到一半的）都刪", async () => {
    await upload();
    await store.put(`floorplans/${H}/r5.png`, new Uint8Array([1]), "image/png");
    expect(await deleteHouse(deps(), H)).toEqual({ ok: true });
    expect(rows).toEqual([]);
    expect(await store.list(`floorplans/${H}/`)).toEqual([]);
    expect(await deleteHouse(deps(), H)).toEqual({ ok: false, code: "not_found" });
  });
});

describe("AI 讀圖（規格 §5、Q2）", () => {
  const ok: FloorplanReader = async () => structuredClone(living) as never;
  const meta = () => (rows[0].meta as { rooms: Record<string, unknown>[] }).rooms;
  beforeEach(async () => { await createHouse(deps(), "小美家"); await upload(); });

  it("開始：房間標讀圖中、戶標 running；執行後寫入格局、狀態完成，預設房名換成 AI 讀到的", async () => {
    const seen: (string | null)[] = [];
    const r = await startRoomRead(deps(), H, "r1", async (images, name) => { seen.push(...images.map(i => i.mime), name); return ok(images, name); });
    if (!r.ok) throw new Error(r.code);
    expect(meta()[0]).toMatchObject({ status: "reading", read_started_at: NOW.toISOString() });
    expect(rows[0].status).toBe("running");
    await r.run();
    expect(seen).toEqual(["image/png", null]);  // 預設房名不送給 AI
    expect(meta()[0]).toMatchObject({ status: "ready", name: "客廳", error: null, edited: false, wall_height_m: 2.8 });
    expect(meta()[0].walls).toHaveLength(4);
    expect(rows[0].status).toBe("ready");
    // 畫面拿不到 AI 原始輸出
    expect((await getHouse(deps(), H))?.rooms[0]).not.toHaveProperty("ai_raw");
  });

  it("管理員自己填的房名不覆蓋，並當作提示送給 AI", async () => {
    await upload(H, "主臥");
    const seen: (string | null)[] = [];
    const r = await startRoomRead(deps(), H, "r2", async (images, name) => { seen.push(name); return ok(images, name); });
    if (r.ok) await r.run();
    expect(seen).toEqual(["主臥"]);
    expect(meta()[1]).toMatchObject({ status: "ready", name: "主臥" });
  });

  it("AI 失敗或結果不合理：標失敗並寫原因，戶標 failed", async () => {
    const r = await startRoomRead(deps(), H, "r1", async () => null);
    if (r.ok) await r.run();
    expect(meta()[0]).toMatchObject({ status: "failed", error: "AI 讀圖失敗或逾時，請重新讀圖" });
    expect(rows[0].status).toBe("failed");
    const bad = await startRoomRead(deps(), H, "r1", async () => ({ ...structuredClone(living), kind: "other" }) as never);
    if (bad.ok) await bad.run();
    expect(meta()[0]).toMatchObject({ status: "failed", error: "看起來不是平面圖或室內照片，請換一張" });
  });

  it("讀圖中不重複開始；超過 3 分鐘視為中斷，可以重新讀圖", async () => {
    expect((await startRoomRead(deps(), H, "r1", ok)).ok).toBe(true);
    expect(await startRoomRead(deps(), H, "r1", ok)).toEqual({ ok: false, code: "busy" });
    const later = new Date(NOW.getTime() + 4 * 60 * 1000);
    expect((await startRoomRead(deps({ now: later }), H, "r1", ok)).ok).toBe(true);
  });

  it("讀圖期間房間被刪掉或又重新讀圖：舊結果不寫入", async () => {
    const r = await startRoomRead(deps(), H, "r1", ok);
    await deleteHouseRoom(deps(), H, "r1");
    if (r.ok) await r.run();
    expect(meta()).toEqual([]);
  });

  it("房間不存在、編號不對、沒設定儲存：擋下", async () => {
    expect(await startRoomRead(deps(), H, "r9", ok)).toEqual({ ok: false, code: "not_found" });
    expect(await startRoomRead(deps(), H, "x", ok)).toEqual({ ok: false, code: "room_invalid" });
    expect(await startRoomRead(deps({ store: null }), H, "r1", ok)).toEqual({ ok: false, code: "storage_disabled" });
  });
});

describe("同一間房的其他角度照片（#144，最多 4 張）", () => {
  const meta = () => (rows[0].meta as { rooms: Record<string, unknown>[] }).rooms;
  beforeEach(async () => { await createHouse(deps(), "小美家"); await upload(); });
  async function addPhoto() {
    const t = await createPhotoUpload(deps(), H, "r1", "image/jpeg", 1000);
    if (!t.ok) return t;
    await store.put(t.path, new Uint8Array([3]), "image/jpeg");
    return { ...(await addRoomPhoto(deps(), H, "r1", t.path)), path: t.path };
  }

  it("簽網址（隨機檔名）→ 確認後加入；畫面拿得到每張的預覽網址", async () => {
    const r = await addPhoto();
    expect(r).toMatchObject({ ok: true, path: expect.stringMatching(new RegExp(`^floorplans/${H}/r1_[a-z0-9]{6}\\.jpg$`)) });
    const path = (r as { path: string }).path;
    expect(meta()[0].photo_paths).toEqual([path]);
    expect((await getHouse(deps(), H))?.rooms[0].photoUrls).toEqual([{ path, url: `memory://read/${path}` }]);
  });

  it("加主圖最多 4 張；還沒傳上去、別間的路徑都擋", async () => {
    for (let i = 0; i < 3; i++) expect((await addPhoto()).ok).toBe(true);
    expect(await createPhotoUpload(deps(), H, "r1", "image/jpeg", 1000)).toEqual({ ok: false, code: "too_many_images" });
    expect(await createPhotoUpload(deps(), H, "r9", "image/jpeg", 1000)).toEqual({ ok: false, code: "not_found" });
    expect(await addRoomPhoto(deps(), H, "r1", `floorplans/${H}/r1_abcdef.jpg`)).toEqual({ ok: false, code: "upload_missing" });
    expect(await addRoomPhoto(deps(), H, "r1", `floorplans/${H}/r2_abcdef.jpg`)).toEqual({ ok: false, code: "room_invalid" });
  });

  it("讀圖時把主圖和其他角度照片一起送給 AI", async () => {
    await addPhoto();
    const seen: string[] = [];
    const r = await startRoomRead(deps(), H, "r1", async images => { seen.push(...images.map(i => i.mime)); return { ...structuredClone(living), kind: "photo" } as never; });
    if (r.ok) await r.run();
    expect(seen).toEqual(["image/png", "image/jpeg"]);
    expect(meta()[0]).toMatchObject({ status: "ready", input: "photo", scale: { m_per_px: null, source: "estimate" } });
  });

  it("移除一張照片；刪房間時所有照片一起刪", async () => {
    const a = await addPhoto() as { path: string };
    const b = await addPhoto() as { path: string };
    expect(await removeRoomPhoto(deps(), H, "r1", a.path)).toEqual({ ok: true });
    expect(meta()[0].photo_paths).toEqual([b.path]);
    expect(await removeRoomPhoto(deps(), H, "r1", a.path)).toEqual({ ok: false, code: "not_found" });
    expect(await deleteHouseRoom(deps(), H, "r1")).toEqual({ ok: true });
    expect(await store.list(`floorplans/${H}/`)).toEqual([]);
  });
});
