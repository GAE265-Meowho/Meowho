// 貓咪模型本機檔案實作（規格書 04 §4）：用暫存資料夾模擬 Cat Studio 的資料夾格式
// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCat, getCat, listCats, localRoot, queuePaint, readCatFile, restorePrevious, setPublication } from "./local";

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

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;
const catPath = (id: string, file: string) => path.join(root, "adoption_cats", id, file);
const read = (id: string, file: string) => fs.readFile(catPath(id, file), "utf-8");
const ID = "cat_20261031_100000";
const NOW = new Date(2026, 9, 31, 14, 5, 9);

describe("JSON 檔帶 BOM", () => {
  it("profile.json 與 paint_job.json 開頭有 BOM 也讀得到", async () => {
    await addCat(ID);
    await fs.writeFile(catPath(ID, "profile.json"), "\uFEFF" + JSON.stringify({ id: ID, name: "有 BOM", photo: "photo.jpg" }));
    await fs.writeFile(catPath(ID, "paint_job.json"), "\uFEFF" + JSON.stringify({ status: "running", step: "AI 上色" }));
    expect(await getCat(root, ID)).toMatchObject({ name: "有 BOM", status: "running", jobStep: "AI 上色" });
  });
});

describe("createCat（沿用 Cat Studio 的 create_cat）", () => {
  it("寫入照片與 profile.json，ID 格式與 Cat Studio 相同，狀態是草稿", async () => {
    const r = await createCat(root, { name: " 小橘 ", ageMonths: "12", weightKg: "4.2", notes: "愛睡", photo: dataUrl("image/png", png) }, NOW);
    expect(r).toEqual({ ok: true, id: "cat_20261031_140509" });
    const profile = JSON.parse(await read("cat_20261031_140509", "profile.json"));
    expect(profile).toMatchObject({ id: "cat_20261031_140509", name: "小橘", age_months: 12, weight_kg: 4.2, notes: "愛睡", photo: "photo.png" });
    expect(await fs.readFile(catPath("cat_20261031_140509", "photo.png"))).toEqual(png);
    expect((await getCat(root, "cat_20261031_140509"))?.status).toBe("draft");
  });
  it("年齡、體重空白或不合法存成 null", async () => {
    const r = await createCat(root, { name: "A", ageMonths: "", weightKg: "-3", photo: dataUrl("image/jpeg", png) }, NOW);
    expect(r.ok).toBe(true);
    expect(await getCat(root, (r as { id: string }).id)).toMatchObject({ ageMonths: null, weightKg: null });
  });
  it("同一秒建立兩隻，ID 加尾碼不覆蓋", async () => {
    const a = await createCat(root, { name: "A", photo: dataUrl("image/png", png) }, NOW);
    const b = await createCat(root, { name: "B", photo: dataUrl("image/png", png) }, NOW);
    expect(a).toEqual({ ok: true, id: "cat_20261031_140509" });
    expect(b).toEqual({ ok: true, id: "cat_20261031_140509_2" });
  });
  it("名稱空白、格式不對、照片太大都拒絕，且不留下資料夾", async () => {
    expect(await createCat(root, { name: "  ", photo: dataUrl("image/png", png) }, NOW)).toEqual({ ok: false, code: "name_required" });
    expect(await createCat(root, { name: "A", photo: dataUrl("image/gif", png) }, NOW)).toEqual({ ok: false, code: "photo_invalid" });
    expect(await createCat(root, { name: "A", photo: "不是 data url" }, NOW)).toEqual({ ok: false, code: "photo_invalid" });
    expect(await createCat(root, { name: "A", photo: dataUrl("image/png", Buffer.alloc(10 * 1024 * 1024 + 1)) }, NOW)).toEqual({ ok: false, code: "photo_too_large" });
    expect(await listCats(root)).toEqual([]);
  });
});

describe("queuePaint（沿用 Cat Studio 的 paint）", () => {
  it("寫入 queued 任務，paint_worker 會讀 view 與 fill", async () => {
    await addCat(ID);
    expect(await queuePaint(root, ID, "left", "tabby", NOW)).toEqual({ ok: true });
    expect(JSON.parse(await read(ID, "paint_job.json"))).toMatchObject({ status: "queued", view: "left", fill: "tabby", queued_at: NOW.toISOString() });
    expect(await getCat(root, ID)).toMatchObject({ status: "queued", photoView: "left", fillPattern: "tabby" });
  });
  it("選項不合法、找不到、已在排隊中都拒絕", async () => {
    await addCat(ID);
    expect(await queuePaint(root, ID, "top", "none")).toEqual({ ok: false, code: "invalid_option" });
    expect(await queuePaint(root, ID, "front", "dots")).toEqual({ ok: false, code: "invalid_option" });
    expect(await queuePaint(root, "cat_20261031_999999", "front", "none")).toEqual({ ok: false, code: "not_found" });
    expect(await queuePaint(root, ID, "front", "none")).toEqual({ ok: true });
    expect(await queuePaint(root, ID, "front", "none")).toEqual({ ok: false, code: "busy" });
  });
  it("生成中不能再送", async () => {
    await addCat(ID, { job: { status: "running" } });
    expect(await queuePaint(root, ID, "front", "none")).toEqual({ ok: false, code: "busy" });
  });
});

describe("保留最近 1 版（worker 只會覆蓋 paint_albedo.png）", () => {
  const newTex = Buffer.from([9, 9, 9]);
  async function workerFinishes(status: "done" | "error") {
    if (status === "done") await fs.writeFile(catPath(ID, "paint_albedo.png"), newTex);
    await fs.writeFile(catPath(ID, "paint_job.json"), JSON.stringify({ status, view: "front", fill: "none", finished_at: "2026-10-31T12:00:00" }));
  }
  it("排隊中：目前貼圖不動，也還沒有上一版", async () => {
    await addCat(ID, { job: { status: "done" }, albedo: true });
    await queuePaint(root, ID, "front", "none", NOW);
    const cat = await getCat(root, ID);
    expect(cat).toMatchObject({ status: "queued", hasAlbedo: true, hasPrevAlbedo: false });
  });
  it("成功：舊貼圖升格為上一版，新貼圖成為目前版", async () => {
    await addCat(ID, { job: { status: "done" }, albedo: true });
    await queuePaint(root, ID, "front", "none", NOW);
    await workerFinishes("done");
    expect(await getCat(root, ID)).toMatchObject({ status: "ready", hasPrevAlbedo: true });
    expect(await fs.readFile(catPath(ID, "paint_albedo_prev.png"))).toEqual(png);
    expect(await fs.readFile(catPath(ID, "paint_albedo.png"))).toEqual(newTex);
    await expect(fs.access(catPath(ID, "paint_albedo_pending_prev.png"))).rejects.toThrow();
  });
  it("失敗：不動目前貼圖，也不會把更早的上一版弄丟", async () => {
    await addCat(ID, { job: { status: "done" }, albedo: true, prev: true });
    await fs.writeFile(catPath(ID, "paint_albedo_prev.png"), Buffer.from([7, 7]));
    await queuePaint(root, ID, "front", "none", NOW);
    await workerFinishes("error");
    expect(await getCat(root, ID)).toMatchObject({ status: "failed", hasAlbedo: true, hasPrevAlbedo: true });
    expect(await fs.readFile(catPath(ID, "paint_albedo_prev.png"))).toEqual(Buffer.from([7, 7]));
    expect(await fs.readFile(catPath(ID, "paint_albedo.png"))).toEqual(png);
  });
  it("成功第二次：更早的上一版被丟掉（只保留最近 1 版）", async () => {
    await addCat(ID, { job: { status: "done" }, albedo: true });
    await fs.writeFile(catPath(ID, "paint_albedo_prev.png"), Buffer.from([7, 7]));
    await queuePaint(root, ID, "front", "none", NOW);
    await workerFinishes("done");
    await getCat(root, ID);
    expect(await fs.readFile(catPath(ID, "paint_albedo_prev.png"))).toEqual(png);
  });
  it("第一次產生（沒有舊貼圖）成功後沒有上一版", async () => {
    await addCat(ID);
    await queuePaint(root, ID, "front", "none", NOW);
    await workerFinishes("done");
    expect(await getCat(root, ID)).toMatchObject({ status: "ready", hasAlbedo: true, hasPrevAlbedo: false });
  });
});

describe("restorePrevious（改用上一版）", () => {
  const prevTex = Buffer.from([5, 5]);
  it("目前版與上一版互換，並寫稽核", async () => {
    await addCat(ID, { job: { status: "done" }, albedo: true, prev: true });
    await fs.writeFile(catPath(ID, "paint_albedo_prev.png"), prevTex);
    expect(await restorePrevious(root, ID, " 新貼圖顏色不對 ", "local-dev", NOW)).toEqual({ ok: true });
    expect(await fs.readFile(catPath(ID, "paint_albedo.png"))).toEqual(prevTex);
    expect(await fs.readFile(catPath(ID, "paint_albedo_prev.png"))).toEqual(png);
    expect(JSON.parse((await read(ID, "audit.jsonl")).trim())).toEqual({ action: "restore_texture", actor: "local-dev", reason: "新貼圖顏色不對", at: NOW.toISOString() });
  });
  it("沒有原因、沒有上一版、生成中、找不到都拒絕，且不動檔案", async () => {
    await addCat(ID, { job: { status: "done" }, albedo: true });
    expect(await restorePrevious(root, ID, "", "a")).toEqual({ ok: false, code: "reason_required" });
    expect(await restorePrevious(root, ID, "x", "a")).toEqual({ ok: false, code: "no_previous" });
    expect(await restorePrevious(root, "cat_20261031_999999", "x", "a")).toEqual({ ok: false, code: "not_found" });
    await fs.writeFile(catPath(ID, "paint_albedo_prev.png"), prevTex);
    await fs.writeFile(catPath(ID, "paint_job.json"), JSON.stringify({ status: "running" }));
    expect(await restorePrevious(root, ID, "x", "a")).toEqual({ ok: false, code: "busy" });
    expect(await fs.readFile(catPath(ID, "paint_albedo.png"))).toEqual(png);
  });
});
