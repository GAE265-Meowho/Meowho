// 貓咪模型本機 API 的守門（規格書 04 §4）：沒有啟用時一律 404；啟用時可讀、白名單檔案、上下架要原因
// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getList, POST as postCreate } from "./route";
import { GET as getOne } from "./[id]/route";
import { GET as getFile } from "./[id]/file/[kind]/route";
import { GET as getBase } from "./base/route";
import { POST as postPublish } from "./[id]/publish/route";
import { POST as postPaint } from "./[id]/paint/route";
import { POST as postRestore } from "./[id]/restore/route";

const ID = "cat_20261031_100000";
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const req = (body?: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body ?? {}) });
let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "cat-api-"));
  const dir = path.join(root, "adoption_cats", ID);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(root, "cat_base", "work"), { recursive: true });
  await fs.writeFile(path.join(dir, "profile.json"), JSON.stringify({ id: ID, name: "小橘", photo: "photo.jpg", created_at: "2026-10-31T10:00:00" }));
  await fs.writeFile(path.join(dir, "photo.jpg"), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(dir, "paint_job.json"), JSON.stringify({ status: "done" }));
  await fs.writeFile(path.join(dir, "paint_albedo.png"), Buffer.from([4, 5, 6]));
  await fs.writeFile(path.join(root, "cat_base", "work", "base_clips.glb"), Buffer.from("glTF"));
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });

describe("沒有本機路徑（改走 bundled 示範貓）", () => {
  const BUNDLED_ID = "cat_20261030_140731";
  // 關掉 Supabase，否則 .env.local 會讓 resolve 走 supabase 而非 bundled
  const stubBundled = () => {
    vi.stubEnv("CAT_STUDIO_ROOT", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
  };
  it("沒設 CAT_STUDIO_ROOT：列表讀示範貓；寫入仍 404", async () => {
    stubBundled();
    const list = await (await getList()).json();
    expect(list.enabled).toBe(true);
    expect(list.cats.some((c: { id: string }) => c.id === BUNDLED_ID)).toBe(true);
    expect((await getOne(new Request("http://x"), ctx({ id: BUNDLED_ID }))).status).toBe(200);
    expect((await getOne(new Request("http://x"), ctx({ id: ID }))).status).toBe(404); // 本機測試貓不在 bundled
    const base = await getBase();
    expect(base.status).toBe(302);
    expect(base.headers.get("location")).toContain("/hq-cat-models/base/base_clips.glb");
    const alb = await getFile(new Request("http://localhost/api"), ctx({ id: BUNDLED_ID, kind: "albedo" }));
    expect(alb.status).toBe(302);
    expect((await postPublish(req({ action: "publish", reason: "x" }), ctx({ id: BUNDLED_ID }))).status).toBe(404);
    expect((await postCreate(req({ name: "A", photo: "data:image/jpeg;base64,QQ==" }))).status).toBe(404);
    expect((await postPaint(req({ view: "front", fill: "none" }), ctx({ id: BUNDLED_ID }))).status).toBe(404);
    expect((await postRestore(req({ reason: "x" }), ctx({ id: BUNDLED_ID }))).status).toBe(404);
  });
  it("production：忽略 CAT_STUDIO_ROOT，仍讀 bundled", async () => {
    vi.stubEnv("CAT_STUDIO_ROOT", root);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const list = await (await getList()).json();
    expect(list.enabled).toBe(true);
    expect(list.cats[0].id).toBe(BUNDLED_ID);
    // 本機測試目錄的檔不能在 production 讀到
    expect((await getFile(new Request("http://localhost/api"), ctx({ id: ID, kind: "albedo" }))).status).toBe(404);
  });
});

describe("啟用（開發模式）", () => {
  beforeEach(() => { vi.stubEnv("CAT_STUDIO_ROOT", root); vi.stubEnv("NODE_ENV", "development"); });

  it("列表與單隻", async () => {
    const list = await (await getList()).json();
    expect(list.cats.map((c: { id: string }) => c.id)).toEqual([ID]);
    const one = await getOne(new Request("http://x"), ctx({ id: ID }));
    expect((await one.json()).cat.status).toBe("ready");
    expect((await getOne(new Request("http://x"), ctx({ id: "cat_20261031_999999" }))).status).toBe(404);
  });
  it("檔案只允許 photo／albedo／albedo_prev；沒有的 404", async () => {
    expect((await getFile(new Request("http://x"), ctx({ id: ID, kind: "albedo" }))).headers.get("Content-Type")).toBe("image/png");
    expect((await getFile(new Request("http://x"), ctx({ id: ID, kind: "photo" }))).headers.get("Content-Type")).toBe("image/jpeg");
    expect((await getFile(new Request("http://x"), ctx({ id: ID, kind: "albedo_prev" }))).status).toBe(404);
    expect((await getFile(new Request("http://x"), ctx({ id: ID, kind: "profile.json" }))).status).toBe(404);
    expect((await getFile(new Request("http://x"), ctx({ id: "..", kind: "albedo" }))).status).toBe(404);
  });
  it("母體 glb", async () => {
    const res = await getBase();
    expect(res.headers.get("Content-Type")).toBe("model/gltf-binary");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("glTF");
  });
  it("上架：動作錯 400、沒原因 400、成功 200、重複上架 409", async () => {
    expect((await postPublish(req({ action: "delete", reason: "x" }), ctx({ id: ID }))).status).toBe(400);
    const noReason = await postPublish(req({ action: "publish", reason: " " }), ctx({ id: ID }));
    expect(noReason.status).toBe(400);
    expect(await noReason.json()).toEqual({ error: "reason_required" });
    expect(await (await postPublish(req({ action: "publish", reason: "OK" }), ctx({ id: ID }))).json()).toEqual({ ok: true, status: "published" });
    expect((await postPublish(req({ action: "publish", reason: "again" }), ctx({ id: ID }))).status).toBe(409);
  });
});

describe("新增、產生、換版", () => {
  const photo = `data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`;
  const enable = () => vi.stubEnv("CAT_STUDIO_ROOT", root);

  it("新增貓咪：201 並回傳 ID；缺名稱或照片不合法回 400", async () => {
    enable();
    const ok = await postCreate(req({ name: "新貓", photo }));
    expect(ok.status).toBe(201);
    const { id } = await ok.json();
    expect(id).toMatch(/^cat_\d{8}_\d{6}/);
    expect((await postCreate(req({ name: "", photo }))).status).toBe(400);
    expect(await (await postCreate(req({ name: "A", photo: "x" }))).json()).toEqual({ error: "photo_invalid" });
  });
  it("新增貓咪：請求標頭顯示過大直接回 413", async () => {
    enable();
    const big = new Request("http://x/api", { method: "POST", headers: { "content-length": String(20 * 1024 * 1024) }, body: "{}" });
    expect((await postCreate(big)).status).toBe(413);
  });
  it("產生：選項不合法 400、成功 200、已排隊 409", async () => {
    enable();
    expect((await postPaint(req({ view: "top", fill: "none" }), ctx({ id: ID }))).status).toBe(400);
    expect((await postPaint(req({ view: "right", fill: "tabby" }), ctx({ id: ID }))).status).toBe(200);
    expect((await postPaint(req({ view: "right", fill: "tabby" }), ctx({ id: ID }))).status).toBe(409);
    expect((await postPaint(req({ view: "front", fill: "none" }), ctx({ id: "cat_20261031_999999" }))).status).toBe(404);
  });
  it("改用上一版：沒原因 400、沒有上一版 409、有上一版 200", async () => {
    enable();
    expect((await postRestore(req({ reason: "" }), ctx({ id: ID }))).status).toBe(400);
    expect((await postRestore(req({ reason: "顏色不對" }), ctx({ id: ID }))).status).toBe(409);
    await fs.writeFile(path.join(root, "adoption_cats", ID, "paint_albedo_prev.png"), Buffer.from([8]));
    expect((await postRestore(req({ reason: "顏色不對" }), ctx({ id: ID }))).status).toBe(200);
  });
});
