// 貓咪模型本機 API 的守門（規格書 04 §4）：沒有啟用時一律 404；啟用時可讀、白名單檔案、上下架要原因
// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getList } from "./route";
import { GET as getOne } from "./[id]/route";
import { GET as getFile } from "./[id]/file/[kind]/route";
import { GET as getBase } from "./base/route";
import { POST as postPublish } from "./[id]/publish/route";

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

describe("沒有啟用", () => {
  it("沒設 CAT_STUDIO_ROOT：全部 404", async () => {
    vi.stubEnv("CAT_STUDIO_ROOT", "");
    expect((await getList()).status).toBe(404);
    expect(await (await getList()).json()).toEqual({ enabled: false });
    expect((await getOne(new Request("http://x"), ctx({ id: ID }))).status).toBe(404);
    expect((await getBase()).status).toBe(404);
    expect((await postPublish(req({ action: "publish", reason: "x" }), ctx({ id: ID }))).status).toBe(404);
  });
  it("production：即使設了路徑也 404", async () => {
    vi.stubEnv("CAT_STUDIO_ROOT", root);
    vi.stubEnv("NODE_ENV", "production");
    expect((await getList()).status).toBe(404);
    expect((await getFile(new Request("http://x"), ctx({ id: ID, kind: "albedo" }))).status).toBe(404);
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
