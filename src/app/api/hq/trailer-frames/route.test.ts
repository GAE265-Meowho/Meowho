// 前導影片分鏡圖刪除 API（#547）：只有管理員、只收分鏡格檔名、刪的是 videos/trailer/ 底下那一版
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: "u1" as string | null, isAdmin: true, removed: [] as string[][] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user ? { id: mocks.user } : null } }) },
    rpc: async (name: string) => ({ data: name === "meow_is_admin" ? mocks.isAdmin : null, error: null }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({ storage: { from: () => ({ remove: async (paths: string[]) => { mocks.removed.push(paths); return { error: null }; } }) } }),
}));

const { DELETE } = await import("./route");
const del = (body: unknown) => DELETE(new Request("http://x/api/hq/trailer-frames", { method: "DELETE", body: JSON.stringify(body) }));

beforeEach(() => { mocks.user = "u1"; mocks.isAdmin = true; mocks.removed = []; });

describe("/api/hq/trailer-frames", () => {
  it("管理員刪掉指定的那一版", async () => {
    const res = await del({ name: "s18__20261119063730.webp" });
    expect(res.status).toBe(200);
    expect(mocks.removed).toEqual([["videos/trailer/s18__20261119063730.webp"]]);
  });

  it("沒登入、不是管理員都不能刪", async () => {
    mocks.user = null;
    expect((await del({ name: "s18__20261119063730.webp" })).status).toBe(401);
    mocks.user = "u1"; mocks.isAdmin = false;
    expect((await del({ name: "s18__20261119063730.webp" })).status).toBe(403);
    expect(mocks.removed).toEqual([]);
  });

  it("不是分鏡格的檔名一律拒絕", async () => {
    for (const name of ["../x.webp", "s99__20261119063730.webp", "s18__x.webp", 3]) expect((await del({ name })).status).toBe(400);
    expect(mocks.removed).toEqual([]);
  });
});
