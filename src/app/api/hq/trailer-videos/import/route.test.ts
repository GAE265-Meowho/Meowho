// 從 ElevenLabs 匯入旁白音檔（#575）：管理員限定、只收旁白格與 elevenlabsusercontent.com 網址
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isAdmin: true, puts: [] as { path: string; size: number; type: string }[] }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: async () => ({ data: mocks.isAdmin, error: null }),
  }),
}));
vi.mock("@/lib/storage/server", () => ({
  getMediaStore: () => ({ put: async (path: string, bytes: Uint8Array, type: string) => { mocks.puts.push({ path, size: bytes.length, type }); } }),
}));

const { POST } = await import("./route");
const post = (body: unknown) => POST(new Request("http://x/api/hq/trailer-videos/import", { method: "POST", body: JSON.stringify(body) }));
const EL = "https://elevenlabsusercontent.com/database/workspace/w/content_generation/s/g/content.mp3?Expires=1&Signature=x";

beforeEach(() => {
  mocks.isAdmin = true; mocks.puts = [];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(1234), { status: 200, headers: { "content-type": "audio/mpeg" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("/api/hq/trailer-videos/import", () => {
  it("不是管理員 403", async () => {
    mocks.isAdmin = false;
    expect((await post({ slot: "n01", url: EL })).status).toBe(403);
  });

  it("只收旁白格與 ElevenLabs 網址", async () => {
    expect((await post({ slot: "s02", url: EL })).status).toBe(400);
    expect((await post({ slot: "n01", url: "https://evil.example/a.mp3" })).status).toBe(400);
    expect((await post({ slot: "n01", url: "https://elevenlabsusercontent.com.evil.example/a.mp3" })).status).toBe(400);
    expect(mocks.puts).toEqual([]);
  });

  it("抓到 mp3 存成該格新版本", async () => {
    const res = await post({ slot: "n01", url: EL });
    expect(res.status).toBe(200);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0].path).toMatch(/^videos\/trailer\/n01\/\d{14}\.mp3$/);
    expect(mocks.puts[0]).toMatchObject({ size: 1234, type: "audio/mpeg" });
  });

  it("來源失敗或太大回 502／413", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 403 })));
    expect((await post({ slot: "n01", url: EL })).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(11 * 1024 * 1024), { status: 200, headers: { "content-type": "audio/mpeg" } })));
    expect((await post({ slot: "n01", url: EL })).status).toBe(413);
  });
});
