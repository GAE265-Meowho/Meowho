// 我的 3D 房間：上傳網址記下 meow_home_videos，建房間只呼叫一次 meow_create_home_processing（#326）
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

/** 只做這兩支 API 用到的查詢：select／insert／update／delete＋eq／in／is／not／limit／maybeSingle */
function fakeDb(tables: Record<string, Row[]>) {
  const rpc: [string, Row][] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op = "select", payload: Row = {};
    const run = async (single: boolean) => {
      const list = (tables[table] ??= []);
      const match = list.filter(r => filters.every(f => f(r)));
      if (op === "insert") {
        if (mocks.failInsert === table) return { error: { message: "insert failed" } };
        list.push(payload); return { error: null };
      }
      if (op === "update") { match.forEach(r => Object.assign(r, payload)); return { error: null }; }
      if (op === "delete") { tables[table] = list.filter(r => !match.includes(r)); return { error: null }; }
      return { data: single ? match[0] ?? null : match, error: null };
    };
    const b = {
      select: () => b, limit: () => b, not: () => b,
      eq: (k: string, v: unknown) => (filters.push(r => r[k] === v), b),
      in: (k: string, vs: unknown[]) => (filters.push(r => vs.includes(r[k])), b),
      is: (k: string, v: unknown) => (filters.push(r => (r[k] ?? null) === v), b),
      insert: (p: Row) => ((op = "insert"), (payload = p), b),
      update: (p: Row) => ((op = "update"), (payload = p), b),
      delete: () => ((op = "delete"), b),
      maybeSingle: () => run(true),
      then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => run(false).then(ok, bad),
    };
    return b;
  };
  return { tables, rpc, from, auth: { getUser: async () => ({ data: { user: { id: USER } } }) } };
}

const USER = "00000000-0000-4000-8000-000000000001";
const HOME = "00000000-0000-4000-8000-000000000002";
const mocks = vi.hoisted(() => ({ db: null as ReturnType<typeof fakeDb> | null, removed: [] as string[], rpcError: null as string | null, failInsert: null as string | null }));
const client = () => ({ ...mocks.db!, rpc: async (name: string, args: Row) => (
  mocks.db!.rpc.push([name, args]), { data: mocks.rpcError ? null : {}, error: mocks.rpcError ? { message: mocks.rpcError } : null }) });
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => client() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => client() }));
vi.mock("@/lib/storage/server", () => ({
  getMediaStore: () => ({
    uploadUrl: async (path: string) => ({ url: `https://blob/${path}`, method: "PUT", headers: {} }),
    remove: async (path: string) => { mocks.removed.push(path); },
  }),
}));

const { POST: postVideo } = await import("./videos/route");
const { POST: postRoom } = await import("./room/route");
const ctx = { params: Promise.resolve({ id: HOME }) };
const req = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  mocks.removed = []; mocks.rpcError = null; mocks.failInsert = null;
  mocks.db = fakeDb({ meow_households: [{ id: HOME, owner_id: USER }], meow_home_videos: [], meow_room_models: [] });
});

describe("POST /api/homes/[id]/videos", () => {
  it("合規的影片先記 meow_home_videos，路徑用這筆的 id", async () => {
    const res = await (await postVideo(req({ mime: "video/mp4", sizeBytes: 29_000_000, durationSec: 111 }), ctx)).json();
    expect(res.path).toBe(`homes/${HOME}/videos/${res.videoId}.mp4`);
    expect(mocks.db!.tables.meow_home_videos).toEqual([expect.objectContaining({
      id: res.videoId, household_id: HOME, path: res.path, purpose: "room", status: "uploading", size_bytes: 29_000_000, duration_s: 111,
    })]);
  });

  it("影片不合規回 400，不留紀錄", async () => {
    const res = await postVideo(req({ mime: "video/mp4", sizeBytes: 29_000_000, durationSec: 200 }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("too_long");
    expect(mocks.db!.tables.meow_home_videos).toEqual([]);
  });

  it("影片紀錄寫不進去回 500，不簽網址", async () => {
    mocks.failInsert = "meow_home_videos";
    const res = await postVideo(req({ mime: "video/mp4", sizeBytes: 29_000_000, durationSec: 111 }), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).upload).toBeUndefined();
  });
});

describe("POST /api/homes/[id]/room", () => {
  const VIDEO = "00000000-0000-4000-8000-000000000003";
  const path = `homes/${HOME}/videos/${VIDEO}.mp4`;
  beforeEach(() => {
    mocks.db!.tables.meow_home_videos.push({ id: VIDEO, household_id: HOME, path, purpose: "room", status: "uploading" });
  });

  it("成功：影片改 uploaded、房間的 video_path 等於影片路徑，只呼叫一次 meow_create_home_processing", async () => {
    const res = await (await postRoom(req({ videoId: VIDEO }), ctx)).json();
    expect(res.created).toBe(true);
    expect(mocks.db!.tables.meow_home_videos[0].status).toBe("uploaded");
    expect(mocks.db!.tables.meow_room_models).toEqual([expect.objectContaining({ id: res.roomId, video_path: path, status: "queued" })]);
    expect(mocks.db!.rpc).toEqual([["meow_create_home_processing", { p_video_id: VIDEO, p_room_id: res.roomId, p_request_id: VIDEO }]]);
    expect(mocks.db!.tables.meow_room_jobs ?? []).toEqual([]);  // 不再自己 insert 工作和報告
    expect(mocks.db!.tables.meow_env_reports ?? []).toEqual([]);
  });

  it("重送同一支影片：沿用房間，不再建一間", async () => {
    const first = await (await postRoom(req({ videoId: VIDEO }), ctx)).json();
    const again = await (await postRoom(req({ videoId: VIDEO }), ctx)).json();
    expect(again).toEqual({ roomId: first.roomId, created: false });
    expect(mocks.db!.tables.meow_room_models).toHaveLength(1);
  });

  it("別的喵戶的影片或格式不對回 400", async () => {
    const other = "00000000-0000-4000-8000-000000000009";
    expect((await postRoom(req({ videoId: other }), ctx)).status).toBe(400);
    expect((await postRoom(req({ videoId: "x" }), ctx)).status).toBe(400);
    expect(mocks.db!.rpc).toEqual([]);
  });

  it("還有房間在轉換時回 409，刪掉剛傳的影片和紀錄", async () => {
    mocks.db!.tables.meow_room_models.push({ id: "room_old", owner_household_id: HOME, status: "running", video_path: "x" });
    const res = await postRoom(req({ videoId: VIDEO }), ctx);
    expect(res.status).toBe(409);
    expect(mocks.removed).toEqual([path]);
    expect(mocks.db!.tables.meow_home_videos).toEqual([]);
  });

  it("已經被清理的影片回 400", async () => {
    mocks.db!.tables.meow_home_videos[0].raw_deleted_at = "2026-11-10T00:00:00Z";
    expect((await postRoom(req({ videoId: VIDEO }), ctx)).status).toBe(400);
    expect(mocks.db!.rpc).toEqual([]);
  });

  it("meow_create_home_processing 失敗回 500，房間、影片檔、影片紀錄都清掉", async () => {
    mocks.rpcError = "env_room_not_found";
    const res = await postRoom(req({ videoId: VIDEO }), ctx);
    expect(res.status).toBe(500);
    expect(mocks.db!.tables.meow_room_models).toEqual([]);
    expect(mocks.removed).toEqual([path]);
    expect(mocks.db!.tables.meow_home_videos).toEqual([]);
  });

  it("不帶 body：照舊建示範房間和示範報告，不呼叫函式", async () => {
    const res = await (await postRoom(new Request("http://x/api", { method: "POST" }), ctx)).json();
    expect(res.created).toBe(true);
    expect(mocks.db!.tables.meow_room_models).toEqual([expect.objectContaining({ id: res.roomId, name: "示範房間", status: "ready", source: "floorplan" })]);
    expect(mocks.db!.tables.meow_env_reports).toHaveLength(1);
    expect(mocks.db!.rpc).toEqual([]);
  });
});
