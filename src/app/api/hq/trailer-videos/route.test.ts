// 前導影片的影片檔 API（#501）：權限繼承影片頁（meow_is_admin）、上傳檢查、列出版本附播放與下載網址
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: "u1" as string | null,
  isAdmin: true,
  paths: [] as string[],
  uploads: [] as string[],
  reads: [] as { path: string; cd?: string }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user ? { id: mocks.user } : null } }) },
    rpc: async (name: string) => ({ data: name === "meow_is_admin" ? mocks.isAdmin : null, error: null }),
  }),
}));
vi.mock("@/lib/storage/server", () => ({
  getMediaStore: () => ({
    list: async (prefix: string) => mocks.paths.filter(p => p.startsWith(prefix)),
    readUrl: async (path: string, _ttl: number, o?: { contentDisposition?: string }) => {
      mocks.reads.push({ path, cd: o?.contentDisposition });
      return `https://blob.example/${path}${o?.contentDisposition ? "?dl" : ""}`;
    },
    uploadUrl: async (path: string, mime: string) => {
      mocks.uploads.push(path);
      return { url: `https://blob.example/${path}?sas`, headers: { "x-ms-blob-type": "BlockBlob", "content-type": mime } };
    },
  }),
}));

const { GET, POST } = await import("./route");
const post = (body: unknown) => POST(new Request("http://x/api/hq/trailer-videos", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  mocks.user = "u1"; mocks.isAdmin = true; mocks.paths = []; mocks.uploads = []; mocks.reads = [];
});

describe("/api/hq/trailer-videos", () => {
  it("沒登入 401、不是管理員 403", async () => {
    mocks.user = null;
    expect((await GET()).status).toBe(401);
    mocks.user = "u1"; mocks.isAdmin = false;
    expect((await GET()).status).toBe(403);
    expect((await post({ slot: "full", mime: "video/mp4", sizeBytes: 10 })).status).toBe(403);
    expect(mocks.uploads).toEqual([]);
  });

  it("管理員拿到上傳網址，路徑在 videos/trailer/<格>/", async () => {
    const res = await post({ slot: "s07-1", mime: "video/mp4", sizeBytes: 5_000_000 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toMatch(/^videos\/trailer\/s07-1\/\d{14}\.mp4$/);
    expect(json.upload.headers["x-ms-blob-type"]).toBe("BlockBlob");
  });

  it("不合規的上傳回 400，不簽網址", async () => {
    expect((await post({ slot: "s08", mime: "video/mp4", sizeBytes: 10 })).status).toBe(400);
    expect((await post({ slot: "full", mime: "image/png", sizeBytes: 10 })).status).toBe(400);
    expect(mocks.uploads).toEqual([]);
  });

  it("列出每格版本（新到舊），附播放與下載網址；下載帶中文檔名", async () => {
    mocks.paths = ["videos/trailer/full/20261118100000.mp4", "videos/trailer/full/20261119100000.mp4", "homes/x/1.mp4"];
    const json = await (await GET()).json();
    expect(json.videos.full.map((v: { at: string }) => v.at)).toEqual(["2026-11-19T10:00:00Z", "2026-11-18T10:00:00Z"]);
    expect(json.videos.full[0].url).toBe("https://blob.example/videos/trailer/full/20261119100000.mp4");
    expect(json.videos.full[0].downloadUrl).toContain("?dl");
    const cd = mocks.reads.find(r => r.cd)?.cd ?? "";
    expect(decodeURIComponent(cd)).toContain("前導影片_完整版_2026-11-19.mp4");
  });
});
