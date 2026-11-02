// 平面圖轉換（#138）資料存取：用記憶體版資料表與儲存模擬，不連線
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/storage/memory";
import type { MediaStore } from "@/lib/storage/types";
import { addUploadedRoom, createHouse, dbFail, createRoomUpload, deleteHouse, deleteHouseRoom, getHouse, listHouses, renameHouseRoom, type Db, type Deps } from "./core";

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
    expect(await listHouses(deps())).toEqual({ ok: true, houses: [{ id: H, name: "小美家", roomCount: 1, updatedAt: NOW.toISOString() }] });
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
    expect(added).toEqual({ ok: true });
    const house = await getHouse(deps(), H);
    expect(house?.rooms).toEqual([{
      id: "r1", name: "房間 1", image_path: `floorplans/${H}/r1.png`, status: "uploaded", created_at: NOW.toISOString(),
      imageUrl: `memory://read/floorplans/${H}/r1.png`,
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
