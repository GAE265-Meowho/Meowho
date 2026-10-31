// 貓咪模型本機檔案實作（規格書 04 §4）：用暫存資料夾模擬 Cat Studio 的資料夾格式
// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCat, listCats, localRoot, readCatFile, setPublication } from "./local";

let root: string;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function addCat(id: string, opts: { name?: string; job?: object; albedo?: boolean; prev?: boolean; photo?: string } = {}) {
  const dir = path.join(root, "adoption_cats", id);
  await fs.mkdir(dir, { recursive: true });
  const photo = opts.photo ?? "photo.jpg";
  await fs.writeFile(path.join(dir, "profile.json"), JSON.stringify({ id, name: opts.name ?? "小橘", photo, created_at: "2026-10-31T10:00:00", age_months: 12, weight_kg: 4.2 }));
  await fs.writeFile(path.join(dir, "photo.jpg"), png);
  if (opts.job) await fs.writeFile(path.join(dir, "paint_job.json"), JSON.stringify(opts.job));
  if (opts.albedo) await fs.writeFile(path.join(dir, "paint_albedo.png"), png);
  if (opts.prev) await fs.writeFile(path.join(dir, "paint_albedo_prev.png"), png);
}

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "cat-studio-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("localRoot", () => {
  it("production 一律關閉，即使設了路徑", () => expect(localRoot({ NODE_ENV: "production", CAT_STUDIO_ROOT: "C:\\x" })).toBeNull());
  it("開發模式有設路徑才啟用", () => {
    expect(localRoot({ NODE_ENV: "development", CAT_STUDIO_ROOT: "C:\\x" })).toBe("C:\\x");
    expect(localRoot({ NODE_ENV: "development" })).toBeNull();
    expect(localRoot({ NODE_ENV: "development", CAT_STUDIO_ROOT: "  " })).toBeNull();
  });
});

describe("listCats / getCat", () => {
  it("資料夾不存在回傳空清單", async () => expect(await listCats(root)).toEqual([]));
  it("讀出名稱、狀態、年齡體重與任務選項，並忽略不是貓咪 ID 的資料夾", async () => {
    await addCat("cat_20261031_100000", { job: { status: "done", view: "left", fill: "tabby", finished_at: "2026-10-31T11:00:00" }, albedo: true });
    await fs.mkdir(path.join(root, "adoption_cats", "not-a-cat"));
    const list = await listCats(root);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "cat_20261031_100000", name: "小橘", status: "ready", photoView: "left", fillPattern: "tabby", ageMonths: 12, weightKg: 4.2, hasAlbedo: true, hasPrevAlbedo: false });
  });
  it("依更新時間新到舊排序", async () => {
    await addCat("cat_20261031_100000", { name: "舊" });
    await addCat("cat_20261031_110000", { name: "新", job: { status: "done", finished_at: "2026-10-31T23:00:00" }, albedo: true });
    expect((await listCats(root)).map(c => c.name)).toEqual(["新", "舊"]);
  });
  it("任務狀態對應：queued、running、error", async () => {
    await addCat("cat_20261031_100000", { job: { status: "queued" } });
    await addCat("cat_20261031_100001", { job: { status: "running", step: "AI 上色" } });
    await addCat("cat_20261031_100002", { job: { status: "error", error: "CUDA out of memory" } });
    const byId = Object.fromEntries((await listCats(root)).map(c => [c.id, c]));
    expect(byId.cat_20261031_100000.status).toBe("queued");
    expect(byId.cat_20261031_100001).toMatchObject({ status: "running", jobStep: "AI 上色" });
    expect(byId.cat_20261031_100002).toMatchObject({ status: "failed", jobError: "CUDA out of memory" });
  });
  it("getCat：ID 格式不對或不存在回傳 null（含路徑穿越）", async () => {
    expect(await getCat(root, "..\\..\\secret")).toBeNull();
    expect(await getCat(root, "cat_20261031_999999")).toBeNull();
  });
});

describe("readCatFile", () => {
  it("回傳照片與貼圖；沒有的回傳 null", async () => {
    await addCat("cat_20261031_100000", { albedo: true });
    expect((await readCatFile(root, "cat_20261031_100000", "photo"))?.type).toBe("image/jpeg");
    expect((await readCatFile(root, "cat_20261031_100000", "albedo"))?.type).toBe("image/png");
    expect(await readCatFile(root, "cat_20261031_100000", "albedo_prev")).toBeNull();
  });
  it("profile 裡的照片欄位若含路徑，一律不讀", async () => {
    await addCat("cat_20261031_100000", { photo: "..\\..\\secret.txt" });
    expect(await readCatFile(root, "cat_20261031_100000", "photo")).toBeNull();
  });
  it("ID 格式不對回傳 null", async () => expect(await readCatFile(root, "../x", "photo")).toBeNull());
});

describe("setPublication", () => {
  const id = "cat_20261031_100000";
  it("已完成的貓可上架，寫入 publication.json 與稽核記錄；之後可下架", async () => {
    await addCat(id, { job: { status: "done" }, albedo: true });
    expect(await setPublication(root, id, "publish", "  預覽確認沒問題  ", "tina@example.com", new Date("2026-10-31T12:00:00Z"))).toEqual({ ok: true, status: "published" });
    expect((await getCat(root, id))?.status).toBe("published");
    const audit = (await fs.readFile(path.join(root, "adoption_cats", id, "audit.jsonl"), "utf-8")).trim().split("\n").map(l => JSON.parse(l));
    expect(audit).toEqual([{ action: "publish_model", actor: "tina@example.com", reason: "預覽確認沒問題", at: "2026-10-31T12:00:00.000Z" }]);
    expect(await setPublication(root, id, "unpublish", "動作需要修正", "tina@example.com")).toEqual({ ok: true, status: "unpublished" });
    expect((await getCat(root, id))?.status).toBe("unpublished");
  });
  it("原因必填", async () => {
    await addCat(id, { job: { status: "done" }, albedo: true });
    expect(await setPublication(root, id, "publish", "   ", "a")).toEqual({ ok: false, code: "reason_required" });
  });
  it("草稿、已上架的貓不能再上架；找不到的貓回 not_found", async () => {
    await addCat(id);
    expect(await setPublication(root, id, "publish", "x", "a")).toEqual({ ok: false, code: "invalid_state" });
    expect(await setPublication(root, "cat_20261031_999999", "publish", "x", "a")).toEqual({ ok: false, code: "not_found" });
  });
});
