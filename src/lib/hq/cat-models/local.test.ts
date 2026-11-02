// 貓咪模型本機檔案實作（規格書 04 §4）：用暫存資料夾模擬 Cat Studio 的資料夾格式
// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCat, getCat, listCats, localRoot, queuePaint, readCatFile, restorePrevious, startViews } from "./local";

let root: string;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** views：三張 AI 照片都已產生（#135 產生紋理貼圖的前置條件） */
async function addCat(id: string, opts: { name?: string; job?: object; albedo?: boolean; prev?: boolean; photo?: string; views?: boolean } = {}) {
  const dir = path.join(root, "adoption_cats", id);
  await fs.mkdir(dir, { recursive: true });
  const photo = opts.photo ?? "photo.jpg";
  const generated = opts.views ? { generated: { views: { left: "gen_left.png", front: "gen_front.png", back: "gen_back.png" } } } : {};
  await fs.writeFile(path.join(dir, "profile.json"), JSON.stringify({ id, name: opts.name ?? "小橘", photo, created_at: "2026-10-31T10:00:00", age_months: 12, weight_kg: 4.2, ...generated }));
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
  it("#104 舊成貓貼圖與新幼貓貼圖可分別預覽", async () => {
    const id = "cat_20261031_100000";
    await addCat(id, { job: { status: "done", base_version: "adult-v1" }, albedo: true });
    const dir = path.join(root, "adoption_cats", id);
    await fs.writeFile(path.join(dir, "paint_albedo_kitten.png"), png);
    const cat = await getCat(root, id);
    expect(cat?.bodyVariants?.adult?.texture.preview).toBe("albedo");
    expect(cat?.bodyVariants?.kitten?.texture.preview).toBe("albedo");
  });
  it("#104 選成貓時任務記錄體型，不改幼貓檔", async () => {
    const id = "cat_20261031_100000";
    await addCat(id, { views: true });
    const dir = path.join(root, "adoption_cats", id);
    await fs.writeFile(path.join(dir, "paint_albedo_kitten.png"), png);
    expect(await queuePaint(root, id, "left", "none", new Date(), "adult")).toEqual({ ok: true });
    expect(JSON.parse(await fs.readFile(path.join(dir, "paint_job.json"), "utf-8")).body_type).toBe("adult");
    expect(await fs.readFile(path.join(dir, "paint_albedo_kitten.png"))).toEqual(png);
  });
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
    const r = await createCat(root, { name: " 小橘 ", gender: "male", ageMonths: "12", weightKg: "4.2", notes: "愛睡", photo: dataUrl("image/png", png) }, NOW);
    expect(r).toEqual({ ok: true, id: "cat_20261031_140509" });
    const profile = JSON.parse(await read("cat_20261031_140509", "profile.json"));
    expect(profile).toMatchObject({ id: "cat_20261031_140509", name: "小橘", gender: "male", age_months: 12, weight_kg: 4.2, notes: "愛睡", photo: "photo.png" });
    expect(await fs.readFile(catPath("cat_20261031_140509", "photo.png"))).toEqual(png);
    expect((await getCat(root, "cat_20261031_140509"))?.status).toBe("draft");
  });
  it("正面、背部照片（#105）：存成 photo_front／photo_back，記在 profile.extra_photos；格式不對的略過", async () => {
    const r = await createCat(root, { name: "A", photo: dataUrl("image/png", png), extras: { front: dataUrl("image/jpeg", png), back: dataUrl("image/gif", png) } }, NOW);
    expect(r).toEqual({ ok: true, id: "cat_20261031_140509" });
    expect(await fs.readFile(catPath("cat_20261031_140509", "photo_front.jpg"))).toEqual(png);
    const profile = JSON.parse(await read("cat_20261031_140509", "profile.json"));
    expect(profile.extra_photos).toEqual({ front: "photo_front.jpg" });
  });
  it("其他角度照片：建立時一起存、可讀回", async () => {
    const { id } = (await createCat(root, { name: "A", photo: dataUrl("image/png", png), extras: { back: dataUrl("image/png", png) } }, NOW)) as { id: string };
    expect((await getCat(root, id))?.extraPhotos).toEqual(["back"]);
    expect(await readCatFile(root, id, "photo_back")).toMatchObject({ type: "image/png" });
  });
  it("AI 三視角（#110）：產生後存 gen_<角度>.png 並記狀態；送出產生時改用 AI 左側面照、原始另存、清去背快取", async () => {
    const { id } = (await createCat(root, { name: "A", photo: dataUrl("image/png", png) }, NOW)) as { id: string };
    const r = await startViews(root, id, ["left", "front", "back"], { makeEdit: () => async () => ({ png: new Uint8Array([7]), usage: null }), analyze: async () => null });
    expect((await getCat(root, id))?.aiRunning).toEqual(["left", "front", "back"]);
    // #135：三視角還沒完成不能送出產生
    expect(await queuePaint(root, id, "front", "none")).toEqual({ ok: false, code: "views_required" });
    await (r as { run: () => Promise<void> }).run();
    expect(await getCat(root, id)).toMatchObject({ aiViews: ["left", "front", "back"], aiRunning: [] });
    expect(await readCatFile(root, id, "gen_left")).toMatchObject({ type: "image/png" });
    await fs.writeFile(catPath(id, "photo_nobg.png"), png);
    expect(await queuePaint(root, id, "front", "none")).toEqual({ ok: true });
    const profile = JSON.parse(await read(id, "profile.json"));
    expect(profile).toMatchObject({ photo: "gen_left.png", original_photo: "photo.png" });
    expect(JSON.parse(await read(id, "paint_job.json")).view).toBe("left");
    await expect(fs.access(catPath(id, "photo_nobg.png"))).rejects.toThrow();
    // 「原始照片」仍是使用者上傳的那張
    expect((await readCatFile(root, id, "photo"))?.data).toEqual(png);
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
    await addCat(ID, { views: true });
    expect(await queuePaint(root, ID, "left", "tabby", NOW)).toEqual({ ok: true });
    expect(JSON.parse(await read(ID, "paint_job.json"))).toMatchObject({ status: "queued", view: "left", fill: "tabby", queued_at: NOW.toISOString() });
    expect(await getCat(root, ID)).toMatchObject({ status: "queued", photoView: "left", fillPattern: "tabby" });
  });
  it("選項不合法、找不到、已在排隊中都拒絕", async () => {
    await addCat(ID, { views: true });
    expect(await queuePaint(root, ID, "top", "none")).toEqual({ ok: false, code: "invalid_option" });
    expect(await queuePaint(root, ID, "front", "dots")).toEqual({ ok: false, code: "invalid_option" });
    expect(await queuePaint(root, "cat_20261031_999999", "front", "none")).toEqual({ ok: false, code: "not_found" });
    expect(await queuePaint(root, ID, "front", "none")).toEqual({ ok: true });
    expect(await queuePaint(root, ID, "front", "none")).toEqual({ ok: false, code: "busy" });
  });
  it("#135 沒有 AI 三視角：views_required，不寫任務", async () => {
    await addCat(ID);
    expect(await queuePaint(root, ID, "front", "none")).toEqual({ ok: false, code: "views_required" });
    await expect(fs.access(catPath(ID, "paint_job.json"))).rejects.toThrow();
  });
  it("生成中不能再送", async () => {
    await addCat(ID, { views: true, job: { status: "running" } });
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
    await addCat(ID, { views: true, job: { status: "done" }, albedo: true });
    await queuePaint(root, ID, "front", "none", NOW);
    const cat = await getCat(root, ID);
    expect(cat).toMatchObject({ status: "queued", hasAlbedo: true, hasPrevAlbedo: false });
  });
  it("成功：舊貼圖升格為上一版，新貼圖成為目前版", async () => {
    await addCat(ID, { views: true, job: { status: "done" }, albedo: true });
    await queuePaint(root, ID, "front", "none", NOW);
    await workerFinishes("done");
    expect(await getCat(root, ID)).toMatchObject({ status: "ready", hasPrevAlbedo: true });
    expect(await fs.readFile(catPath(ID, "paint_albedo_prev.png"))).toEqual(png);
    expect(await fs.readFile(catPath(ID, "paint_albedo.png"))).toEqual(newTex);
    await expect(fs.access(catPath(ID, "paint_albedo_pending_prev.png"))).rejects.toThrow();
  });
  it("失敗：不動目前貼圖，也不會把更早的上一版弄丟", async () => {
    await addCat(ID, { views: true, job: { status: "done" }, albedo: true, prev: true });
    await fs.writeFile(catPath(ID, "paint_albedo_prev.png"), Buffer.from([7, 7]));
    await queuePaint(root, ID, "front", "none", NOW);
    await workerFinishes("error");
    expect(await getCat(root, ID)).toMatchObject({ status: "failed", hasAlbedo: true, hasPrevAlbedo: true });
    expect(await fs.readFile(catPath(ID, "paint_albedo_prev.png"))).toEqual(Buffer.from([7, 7]));
    expect(await fs.readFile(catPath(ID, "paint_albedo.png"))).toEqual(png);
  });
  it("成功第二次：更早的上一版被丟掉（只保留最近 1 版）", async () => {
    await addCat(ID, { views: true, job: { status: "done" }, albedo: true });
    await fs.writeFile(catPath(ID, "paint_albedo_prev.png"), Buffer.from([7, 7]));
    await queuePaint(root, ID, "front", "none", NOW);
    await workerFinishes("done");
    await getCat(root, ID);
    expect(await fs.readFile(catPath(ID, "paint_albedo_prev.png"))).toEqual(png);
  });
  it("第一次產生（沒有舊貼圖）成功後沒有上一版", async () => {
    await addCat(ID, { views: true });
    await queuePaint(root, ID, "front", "none", NOW);
    await workerFinishes("done");
    expect(await getCat(root, ID)).toMatchObject({ status: "ready", hasAlbedo: true, hasPrevAlbedo: false });
  });
});

describe("母體版本跟著貼圖（成貓／幼貓，#88）", () => {
  // 真正的 worker（write_job）是合併欄位，不是整個覆寫
  async function workerMerges(fields: Record<string, unknown>) {
    const job = JSON.parse(await read(ID, "paint_job.json"));
    await fs.writeFile(catPath(ID, "paint_job.json"), JSON.stringify({ ...job, ...fields }));
  }
  it("排隊中仍用目前貼圖的母體；重畫成幼貓後換回上一版，母體也換回成貓", async () => {
    await addCat(ID, { views: true, job: { status: "done", base_version: "adult-v1" }, albedo: true });
    await queuePaint(root, ID, "front", "none", NOW);
    expect(await getCat(root, ID)).toMatchObject({ status: "queued", body: "adult" });
    await fs.writeFile(catPath(ID, "paint_albedo.png"), Buffer.from([9]));
    await workerMerges({ status: "done", base_version: "kitten-v1" });
    expect(await getCat(root, ID)).toMatchObject({ status: "ready", body: "kitten", hasPrevAlbedo: true });
    expect(await restorePrevious(root, ID, "換回來", "local-dev", NOW)).toEqual({ ok: true });
    expect(await getCat(root, ID)).toMatchObject({ body: "adult" });
    expect(await restorePrevious(root, ID, "再換", "local-dev", NOW)).toEqual({ ok: true });
    expect(await getCat(root, ID)).toMatchObject({ body: "kitten" });
  });
  it("重畫失敗：母體維持目前貼圖的", async () => {
    await addCat(ID, { views: true, job: { status: "done", base_version: "kitten-v1" }, albedo: true });
    await queuePaint(root, ID, "front", "none", NOW);
    await workerMerges({ status: "error" });
    expect(await getCat(root, ID)).toMatchObject({ status: "failed", body: "kitten" });
  });
});

describe("restorePrevious（改用上一版）", () => {
  const prevTex = Buffer.from([5, 5]);
  it("目前版與上一版互換，並寫稽核", async () => {
    await addCat(ID, { views: true, job: { status: "done" }, albedo: true, prev: true });
    await fs.writeFile(catPath(ID, "paint_albedo_prev.png"), prevTex);
    expect(await restorePrevious(root, ID, " 新貼圖顏色不對 ", "local-dev", NOW)).toEqual({ ok: true });
    expect(await fs.readFile(catPath(ID, "paint_albedo.png"))).toEqual(prevTex);
    expect(await fs.readFile(catPath(ID, "paint_albedo_prev.png"))).toEqual(png);
    expect(JSON.parse((await read(ID, "audit.jsonl")).trim())).toEqual({ action: "restore_texture", actor: "local-dev", reason: "新貼圖顏色不對", at: NOW.toISOString() });
  });
  it("沒有原因、沒有上一版、生成中、找不到都拒絕，且不動檔案", async () => {
    await addCat(ID, { views: true, job: { status: "done" }, albedo: true });
    expect(await restorePrevious(root, ID, "", "a")).toEqual({ ok: false, code: "reason_required" });
    expect(await restorePrevious(root, ID, "x", "a")).toEqual({ ok: false, code: "no_previous" });
    expect(await restorePrevious(root, "cat_20261031_999999", "x", "a")).toEqual({ ok: false, code: "not_found" });
    await fs.writeFile(catPath(ID, "paint_albedo_prev.png"), prevTex);
    await fs.writeFile(catPath(ID, "paint_job.json"), JSON.stringify({ status: "running" }));
    expect(await restorePrevious(root, ID, "x", "a")).toEqual({ ok: false, code: "busy" });
    expect(await fs.readFile(catPath(ID, "paint_albedo.png"))).toEqual(png);
  });
});
