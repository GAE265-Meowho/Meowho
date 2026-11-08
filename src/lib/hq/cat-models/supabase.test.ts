// 貓咪模型 Supabase 實作（#88）：新增（簽上傳網址→建草稿）、產生、換版的檢查與寫入內容。用假的 Supabase client，不連線。
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table?: string; op: string; args: unknown[] };
const calls: Call[] = [];
let user: { id: string } | null = { id: "u-1" };
let files: { name: string }[] = [];
let insertError: { code: string } | null = null;
let modelRow: Record<string, unknown> | null = null;
let download: Blob | null = null;
let variantRows: Record<string, unknown>[] | null = null;
let jobRows: Record<string, unknown>[] | null = null;

/** 夠用的假 client：記下每次呼叫，回傳測試設定的結果 */
function fakeClient() {
  const query = (table: string) => {
    const q = {
      select: (...a: unknown[]) => { calls.push({ table, op: "select", args: a }); return q; },
      eq: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: table === "meow_cat_models" ? modelRow : table === "meow_cat_model_variants" ? variantRows?.[0] ?? null : null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: table === "meow_cat_model_variants" ? variantRows : table === "meow_cat_model_jobs" ? jobRows : null,
        error: table === "meow_cat_model_variants" && variantRows === null ? { message: "missing table" } : null }),
      insert: async (row: unknown) => { calls.push({ table, op: "insert", args: [row] }); return { error: insertError }; },
      update: (row: unknown) => { calls.push({ table, op: "update", args: [row] }); return q; },
    };
    return q;
  };
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: query,
    rpc: async (...a: unknown[]) => { calls.push({ op: "rpc", args: a }); return { data: null, error: null }; },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (p: string) => { calls.push({ op: "sign", args: [p] }); return { data: { token: "tok" }, error: null }; },
        list: async () => ({ data: files, error: null }),
        download: async (p: string) => { calls.push({ op: "download", args: [p] }); return { data: download, error: null }; },
        upload: async (p: string, _b: unknown, o: unknown) => { calls.push({ op: "upload", args: [p, o] }); return { error: null }; },
        remove: async (paths: string[]) => { calls.push({ op: "remove", args: [paths] }); return { error: null }; },
      }),
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => fakeClient() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => null }));
/** next/server 的 after()：記下背景工作，測試自己決定何時執行 */
const afterTasks: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (task: () => unknown) => { afterTasks.push(task); } }));

const { sbStartViews, sbCreateCat, sbPhotoUpload, sbQueuePaint, sbRestore, sbConfirmTexture, sbAutoPaint, sbBackfillPaint, sbGetCat, sbListCats } = await import("./supabase");
/** 找寫入某個欄位的 update（同一次操作可能有好幾筆 update） */
const updateWith = (key: string) => calls.find(c => c.op === "update" && key in (c.args[0] as object))?.args[0] as Record<string, unknown> | undefined;

const ID = "cat_20261101_090507";
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, name: "小虎", owner_type: "template", status: "draft", profile: { age_months: 3 }, photo_path: `${ID}/photo.png`,
  photo_view: null, fill_pattern: null, albedo_path: null, prev_albedo_path: null, base_version: null, meta: {},
  created_at: "2026-11-01T01:00:00Z", updated_at: "2026-11-01T01:00:00Z", ...over,
});

/** #135：三視角都完成的 profile.generated（產生紋理貼圖的前置條件） */
const views = { left: `${ID}/gen_left.png`, front: `${ID}/gen_front.png`, back: `${ID}/gen_back.png` };
const READY = { generated: { views } };

describe("#104 依體型獨立操作", () => {
  it("生成任務明確記錄選擇的體型", async () => {
    process.env.CAT_MODEL_VARIANTS_WORKER_READY = "1";
    modelRow = row({ profile: { age_months: 3, ...READY } });
    variantRows = [];
    expect(await sbQueuePaint(ID, "left", "none", "adult")).toEqual({ ok: true });
    expect(calls.find(c => c.table === "meow_cat_model_jobs" && c.op === "insert")?.args[0]).toMatchObject({ body_type: "adult" });
    // 幼貓還沒有貼圖：記在 meta.auto_paint，worker 做完成貓接著做幼貓
    expect(updateWith("meta")).toEqual({ meta: { auto_paint: ["kitten"] } });
  });
  it("示範貓合併（0028）：「/」開頭的貼圖是網站內建靜態檔，原樣當網址；bucket 路徑轉公開網址", async () => {
    process.env.CAT_MODEL_VARIANTS_WORKER_READY = "1";
    modelRow = row({ status: "ready", albedo_path: "cats/a.png", base_version: "adult-v1" });
    const kitten = "/hq-cat-models/cats/cat_20261030_140731/paint_albedo_kitten.png";
    variantRows = [
      { body_type: "adult", albedo_path: "cats/a.png", prev_albedo_path: null, base_version: "adult-v1", prev_base_version: null, confirmed_albedo: "cats/a.png" },
      { body_type: "kitten", albedo_path: kitten, prev_albedo_path: null, base_version: "kitten-v1", prev_base_version: null, confirmed_albedo: kitten },
    ];
    const cat = await sbGetCat(ID);
    expect(cat?.bodyVariants?.kitten).toMatchObject({ albedoUrl: kitten, texture: { state: "confirmed" } });
    expect(cat?.bodyVariants?.adult?.albedoUrl).toMatch(/\/storage\/v1\/object\/public\/meow-cat-models\/cats\/a\.png$/);
    expect(cat?.body).toBe("adult");
  });
  it("確認幼貓不更新成貓的舊欄位", async () => {
    process.env.CAT_MODEL_VARIANTS_WORKER_READY = "1";
    modelRow = row({ status: "ready", albedo_path: "adult.png" });
    variantRows = [{ body_type: "kitten", albedo_path: "kitten.png", prev_albedo_path: null,
      base_version: "kitten-v1", prev_base_version: null, confirmed_albedo: null }];
    expect(await sbConfirmTexture(ID, "kitten")).toEqual({ ok: true });
    expect(calls.find(c => c.table === "meow_cat_model_variants" && c.op === "update")?.args[0]).toMatchObject({ confirmed_albedo: "kitten.png" });
    expect(calls.find(c => c.table === "meow_cat_models" && c.op === "update")).toBeUndefined();
  });
});

beforeEach(() => { delete process.env.CAT_MODEL_VARIANTS_WORKER_READY; calls.length = 0; user = { id: "u-1" }; files = []; insertError = null; modelRow = row(); variantRows = null; jobRows = null; download = new Blob(["jpg"], { type: "image/jpeg" }); });

describe("sbPhotoUpload（新增第一步）", () => {
  it("格式、大小不合法直接擋，不簽網址", async () => {
    expect(await sbPhotoUpload("image/gif", 10)).toEqual({ ok: false, code: "photo_invalid" });
    expect(await sbPhotoUpload("image/png", 0)).toEqual({ ok: false, code: "photo_invalid" });
    expect(await sbPhotoUpload("image/png", 11 * 1024 * 1024)).toEqual({ ok: false, code: "photo_too_large" });
    expect(calls.some(c => c.op === "sign")).toBe(false);
  });
  it("沒登入：permission_denied", async () => {
    user = null;
    expect(await sbPhotoUpload("image/png", 10)).toEqual({ ok: false, code: "permission_denied" });
  });
  it("登入：配 ID、簽 <ID>/photo.<副檔名>", async () => {
    const r = await sbPhotoUpload("image/webp", 10, new Date(2026, 10, 1, 9, 5, 7));
    expect(r).toEqual({ ok: true, id: ID, bucket: "meow-cat-model-photos", path: `${ID}/photo.webp`, token: "tok" });
  });
  it("正面、背部照片（#105）：同一隻貓的 ID，簽 <ID>/photo_<角度>.<副檔名>；角度或 ID 不對就擋", async () => {
    expect(await sbPhotoUpload("image/jpeg", 10, new Date(), { id: ID, view: "front" }))
      .toEqual({ ok: true, id: ID, bucket: "meow-cat-model-photos", path: `${ID}/photo_front.jpg`, token: "tok" });
    expect(await sbPhotoUpload("image/png", 10, new Date(), { id: ID, view: "back" })).toMatchObject({ path: `${ID}/photo_back.png` });
    expect(await sbPhotoUpload("image/png", 10, new Date(), { id: ID, view: "side" })).toEqual({ ok: false, code: "photo_invalid" });
    expect(await sbPhotoUpload("image/png", 10, new Date(), { id: "../x", view: "front" })).toEqual({ ok: false, code: "photo_invalid" });
  });
});

describe("sbCreateCat（新增第二步）", () => {
  it("照片路徑不是自己 ID 底下：photo_invalid，不寫資料表", async () => {
    expect(await sbCreateCat({ id: ID, photoPath: "cat_20261101_000000/photo.png", name: "小虎" })).toEqual({ ok: false, code: "photo_invalid" });
    expect(calls.some(c => c.op === "insert")).toBe(false);
  });
  it("照片還沒傳上去：photo_invalid", async () => {
    expect(await sbCreateCat({ id: ID, photoPath: `${ID}/photo.png`, name: "小虎" })).toEqual({ ok: false, code: "photo_invalid" });
  });
  it("成功：草稿、範本貓、記建立者與 profile", async () => {
    files = [{ name: "photo.png" }];
    expect(await sbCreateCat({ id: ID, photoPath: `${ID}/photo.png`, name: " 小虎 ", gender: "female", ageMonths: "3", weightKg: "", notes: "x" }))
      .toEqual({ ok: true, id: ID });
    const insert = calls.find(c => c.op === "insert")!;
    expect(insert.table).toBe("meow_cat_models");
    expect(insert.args[0]).toMatchObject({
      id: ID, name: "小虎", owner_type: "template", status: "draft", photo_path: `${ID}/photo.png`, created_by: "u-1",
      profile: { gender: "female", age_months: 3, weight_kg: null, notes: "x" },
    });
  });
  it("正面、背部照片（#105）：已上傳的記進 profile.extra_photos；路徑不對或沒上傳就略過，不擋建立", async () => {
    files = [{ name: "photo.png" }, { name: "photo_front.jpg" }];
    expect(await sbCreateCat({
      id: ID, photoPath: `${ID}/photo.png`, name: "小虎",
      extraPaths: { front: `${ID}/photo_front.jpg`, back: `${ID}/photo_back.jpg` },
    })).toEqual({ ok: true, id: ID });
    const insert = calls.find(c => c.op === "insert")!;
    expect((insert.args[0] as { profile: unknown }).profile).toMatchObject({ extra_photos: { front: `${ID}/photo_front.jpg` } });
    expect((insert.args[0] as { profile: { extra_photos: object } }).profile.extra_photos).not.toHaveProperty("back");
  });
  it("同一秒有人建了同 ID：busy", async () => {
    files = [{ name: "photo.png" }];
    insertError = { code: "23505" };
    expect(await sbCreateCat({ id: ID, photoPath: `${ID}/photo.png`, name: "小虎" })).toEqual({ ok: false, code: "busy" });
  });
});

describe("sbStartViews（AI 三視角，#110）", () => {
  const fake = () => async () => ({ png: new Uint8Array([9]), usage: null });
  const NOW = new Date("2026-11-02T00:00:00Z");
  it("沒設定影像模型：ai_disabled；角度不對：invalid_option", async () => {
    expect(await sbStartViews(ID)).toEqual({ ok: false, code: "ai_disabled" });
    expect(await sbStartViews(ID, ["side"], { makeEdit: fake, analyze: async () => null })).toEqual({ ok: false, code: "invalid_option" });
  });
  it("先標記產生中，run 讀原始照片、平行產生、存 gen_<角度>.png、寫回結果", async () => {
    const r = await sbStartViews(ID, ["left", "back"], { makeEdit: fake, analyze: async () => null, now: NOW });
    expect(r.ok).toBe(true);
    const start = calls.find(c => c.op === "update")!.args[0] as { profile: { generated: unknown } };
    expect(start.profile.generated).toEqual({ running: ["left", "back"], errors: {}, started_at: NOW.toISOString() });
    calls.length = 0;
    await (r as { run: () => Promise<void> }).run();
    expect(calls.find(c => c.op === "download")!.args[0]).toBe(`${ID}/photo.png`);
    expect(calls.filter(c => c.op === "upload").map(c => c.args[0]).sort()).toEqual([`${ID}/gen_back.png`, `${ID}/gen_left.png`]);
    const done = calls.filter(c => c.op === "update").at(-1)!.args[0] as { profile: { generated: unknown } };
    expect(done.profile.generated).toMatchObject({ views: { left: `${ID}/gen_left.png`, back: `${ID}/gen_back.png` }, running: [] });
  });
  it("帶入補傳的正面照當第二張參考、存年齡判斷與中英指示、記畫質（#110 Stitch 版）", async () => {
    modelRow = row({ profile: { age_months: 3, extra_photos: { front: `${ID}/photo_front.jpg` } } });
    let refCount = 0;
    const r = await sbStartViews(ID, ["left"], {
      makeEdit: () => async refs => { refCount = refs.length; return { png: new Uint8Array([9]), usage: { input: 10, output: 196, textIn: null, imageIn: null } }; },
      analyze: async () => ({ months: 2, isCat: true, coat: "灰白", breed: null, confidence: 0.9 }), now: NOW, quality: "medium", size: "bogus",
    });
    const start = calls.find(c => c.op === "update")!.args[0] as { profile: { generated: Record<string, unknown> } };
    expect(start.profile.generated).toMatchObject({ quality: "medium" });
    expect(start.profile.generated).not.toHaveProperty("size");
    calls.length = 0;
    await (r as { run: () => Promise<void> }).run();
    expect(calls.filter(c => c.op === "download").map(c => c.args[0])).toEqual([`${ID}/photo.png`, `${ID}/photo_front.jpg`]);
    expect(refCount).toBe(2);
    const done = calls.filter(c => c.op === "update").at(-1)!.args[0] as { profile: { generated: Record<string, unknown> } };
    expect(done.profile.generated).toMatchObject({
      age: { months: 2, source: "ai", coat: "灰白" },
      usage: { left: { output: 196 } },
    });
    expect((done.profile.generated.prompts as { left: { zh: string } }).left.zh).toContain("這是幼貓");
  });
  it("讀不到原始照片：全部記失敗", async () => {
    download = null;
    const r = await sbStartViews(ID, ["front"], { makeEdit: fake, analyze: async () => null, now: NOW });
    await (r as { run: () => Promise<void> }).run();
    const done = calls.filter(c => c.op === "update").at(-1)!.args[0] as { profile: { generated: { errors: unknown } } };
    expect(done.profile.generated.errors).toEqual({ front: "讀不到原始照片" });
  });
  it("產生中再按：busy", async () => {
    modelRow = row({ profile: { generated: { running: ["left"], started_at: NOW.toISOString() } } });
    expect(await sbStartViews(ID, ["left"], { makeEdit: fake, analyze: async () => null, now: NOW })).toEqual({ ok: false, code: "busy" });
  });
});

describe("sbQueuePaint 改用 AI 左側面照（#110）", () => {
  it("有 AI 左側面照：photo_path 換成 AI 照片、原始另存、清去背快取、角度固定 left", async () => {
    modelRow = row({ profile: READY });
    expect(await sbQueuePaint(ID, "front", "none")).toEqual({ ok: true });
    const swap = updateWith("photo_path");
    expect(swap).toEqual({ photo_path: `${ID}/gen_left.png`, profile: { ...READY, original_photo: `${ID}/photo.png` } });
    expect(calls.find(c => c.op === "remove")!.args[0]).toEqual([`${ID}/photo_nobg.png`]);
    expect((calls.find(c => c.op === "insert")!.args[0] as { view: string }).view).toBe("left");
  });
  it("#135 沒有 AI 三視角、只完成一部分、產生中或有失敗：views_required，不新增任務", async () => {
    const cases = [
      {},
      { generated: { views: { left: views.left } } },
      { generated: { views, running: ["back"], started_at: new Date().toISOString() } },
      { generated: { views, errors: { back: "AI 影像服務忙碌中" } } },
    ];
    for (const profile of cases) {
      modelRow = row({ profile });
      expect(await sbQueuePaint(ID, "right", "tabby")).toEqual({ ok: false, code: "views_required" });
    }
    expect(calls.some(c => c.op === "insert")).toBe(false);
  });
});

describe("sbAutoPaint（前台上傳後自動排成貓／幼貓紋理）", () => {
  const sb = () => fakeClient() as unknown as Parameters<typeof sbAutoPaint>[1];
  const member = (over: Record<string, unknown> = {}) => row({ owner_type: "member", status: "ready", profile: READY, ...over });
  const job = () => calls.find(c => c.table === "meow_cat_model_jobs" && c.op === "insert")?.args[0];
  it("三視角好了：先排這隻貓年齡層的體型，其餘記在 meta.auto_paint、用 AI 左側面照", async () => {
    modelRow = member();
    variantRows = [{ body_type: "kitten", albedo_path: "default" }];
    expect(await sbAutoPaint(ID, sb())).toBe("kitten");
    expect(updateWith("meta")).toEqual({ meta: { auto_paint: ["adult"] } });
    expect(job()).toMatchObject({ model_id: ID, status: "queued", body_type: "kitten", view: "left", fill: "none" });
    expect(updateWith("photo_path")).toMatchObject({ photo_path: `${ID}/gen_left.png` });
    expect(updateWith("status")).toMatchObject({ status: "queued" });
  });
  it("成貓已排過（不論成功失敗）、幼貓還沒：只排幼貓", async () => {
    modelRow = member();
    variantRows = [{ body_type: "adult", albedo_path: "default" }];
    jobRows = [{ body_type: "adult", status: "error" }];
    expect(await sbAutoPaint(ID, sb())).toBe("kitten");
    expect(updateWith("meta")).toEqual({ meta: { auto_paint: [] } });
  });
  it("MeowHQ 自建的貓：已有成貓貼圖就補幼貓，沿用上次的補花紋", async () => {
    modelRow = row({ status: "ready", fill_pattern: "tabby", profile: { age_months: 24, ...READY } });
    variantRows = [{ body_type: "adult", albedo_path: "cats/a.png" }];
    jobRows = [{ body_type: "adult", status: "done" }];
    expect(await sbAutoPaint(ID, sb())).toBe("kitten");
    expect(job()).toMatchObject({ body_type: "kitten", fill: "tabby" });
  });
  it("不排：三視角沒好、已有任務在跑、兩個體型都有貼圖", async () => {
    const cases: [Record<string, unknown>, Record<string, unknown>[] | null, Record<string, unknown>[] | null][] = [
      [member({ profile: {} }), [], null],
      [member(), [], [{ body_type: "adult", status: "running" }]],
      [member(), [{ body_type: "adult", albedo_path: "a.png" }, { body_type: "kitten", albedo_path: "k.png" }], null],
    ];
    for (const [m, v, j] of cases) {
      modelRow = m; variantRows = v; jobRows = j;
      expect(await sbAutoPaint(ID, sb())).toBeNull();
    }
    expect(job()).toBeUndefined();
  });
});

describe("sbBackfillPaint（MeowHQ 補排紋理貼圖）", () => {
  it("沒登入：permission_denied", async () => {
    user = null;
    expect(await sbBackfillPaint()).toEqual({ ok: false, code: "permission_denied" });
  });
});

describe("sbQueuePaint（產生）", () => {
  it("選項不合法 400 類錯誤", async () => {
    expect(await sbQueuePaint(ID, "top", "none")).toEqual({ ok: false, code: "invalid_option" });
  });
  it("已在排隊：busy，不新增任務", async () => {
    modelRow = row({ status: "queued" });
    expect(await sbQueuePaint(ID, "front", "tabby")).toEqual({ ok: false, code: "busy" });
    expect(calls.some(c => c.op === "insert")).toBe(false);
  });
  it("資料庫 unique index 擋下（同時兩個人按）：busy", async () => {
    modelRow = row({ profile: READY });
    insertError = { code: "23505" };
    expect(await sbQueuePaint(ID, "front", "tabby")).toEqual({ ok: false, code: "busy" });
  });
  it("成功：新增 queued 任務、貓改排隊中、寫稽核", async () => {
    modelRow = row({ profile: { age_months: 3, ...READY } });
    expect(await sbQueuePaint(ID, "left", "tabby")).toEqual({ ok: true });
    expect(calls.find(c => c.op === "insert")).toMatchObject({ table: "meow_cat_model_jobs", args: [{ model_id: ID, status: "queued", view: "left", fill: "tabby" }] });
    expect(updateWith("status")).toMatchObject({ status: "queued" });
    expect(calls.find(c => c.op === "rpc")?.args[1]).toMatchObject({ p_action: "generate_model", p_target_id: ID, p_detail: { body: "kitten" } });
  });
});

describe("貼圖確認（#129）", () => {
  it("舊資料第一次重新產生：先記下目前版為已確認，不動貼圖", async () => {
    modelRow = row({ status: "ready", albedo_path: "a1.png", prev_albedo_path: null, profile: { age_months: 3, ...READY } });
    expect(await sbQueuePaint(ID, "left", "none")).toEqual({ ok: true });
    expect(updateWith("profile")).toEqual({ profile: { age_months: 3, ...READY, confirmed_albedo: "a1.png" } });
    expect(updateWith("albedo_path")).toBeUndefined();
  });
  it("新貼圖待確認又重新產生：丟掉未確認的，已確認的換回目前版", async () => {
    modelRow = row({
      status: "ready", albedo_path: "a2.png", prev_albedo_path: "a1.png", base_version: "kitten-v1", meta: { prev_base_version: "adult-v1" },
      profile: { age_months: 3, confirmed_albedo: "a1.png", ...READY },
    });
    expect(await sbQueuePaint(ID, "left", "none")).toEqual({ ok: true });
    expect(updateWith("albedo_path")).toEqual({ albedo_path: "a1.png", prev_albedo_path: null, base_version: "adult-v1", meta: { prev_base_version: null } });
    expect(calls.find(c => c.op === "remove")?.args[0]).toEqual(["a2.png"]);
  });
  it("已確認的貼圖重新產生：不調整", async () => {
    modelRow = row({ status: "ready", albedo_path: "a2.png", prev_albedo_path: "a1.png", profile: { confirmed_albedo: "a2.png", ...READY } });
    expect(await sbQueuePaint(ID, "left", "none")).toEqual({ ok: true });
    expect(updateWith("albedo_path")).toBeUndefined();
    // 只會清 AI 照片的去背快取，不刪任何貼圖
    expect(calls.filter(c => c.op === "remove").map(c => c.args[0])).toEqual([[`${ID}/photo_nobg.png`]]);
  });
  it("確認使用：記下目前版、寫稽核；忙碌中或沒有貼圖擋下", async () => {
    modelRow = row({ status: "running", albedo_path: "a2.png" });
    expect(await sbConfirmTexture(ID)).toEqual({ ok: false, code: "busy" });
    modelRow = row({ status: "draft" });
    expect(await sbConfirmTexture(ID)).toEqual({ ok: false, code: "no_texture" });
    modelRow = row({ status: "ready", albedo_path: "a2.png", profile: { age_months: 3, confirmed_albedo: "a1.png" } });
    expect(await sbConfirmTexture(ID)).toEqual({ ok: true });
    expect(updateWith("profile")).toMatchObject({ profile: { age_months: 3, confirmed_albedo: "a2.png" } });
    expect(calls.find(c => c.op === "rpc")?.args[1]).toMatchObject({ p_action: "confirm_texture", p_target_id: ID });
  });
  it("改用上一版也算確認", async () => {
    modelRow = row({ status: "ready", albedo_path: "a2.png", prev_albedo_path: "a1.png", profile: { confirmed_albedo: "a1.png" } });
    expect(await sbRestore(ID, "新的不好看")).toEqual({ ok: true });
    expect(updateWith("albedo_path")).toMatchObject({ albedo_path: "a1.png", profile: { confirmed_albedo: "a1.png" } });
  });
  it("讀取時帶出採用狀態：已畫好的貼圖直接用目前版", async () => {
    const { sbGetCat } = await import("./supabase");
    modelRow = row({ status: "ready", albedo_path: "a2.png", prev_albedo_path: "a1.png", base_version: "adult-v1", meta: { prev_base_version: "kitten-v1" }, profile: { confirmed_albedo: "a1.png" } });
    expect((await sbGetCat(ID))?.texture).toEqual({ state: "confirmed", preview: "albedo", previewBody: "adult" });
  });
});

describe("sbRestore（改用上一版）", () => {
  it("沒原因、沒有上一版、忙碌中都擋", async () => {
    expect(await sbRestore(ID, " ")).toEqual({ ok: false, code: "reason_required" });
    modelRow = row({ albedo_path: "a.png" });
    expect(await sbRestore(ID, "顏色不對")).toEqual({ ok: false, code: "no_previous" });
    modelRow = row({ status: "running", albedo_path: "a.png", prev_albedo_path: "b.png" });
    expect(await sbRestore(ID, "顏色不對")).toEqual({ ok: false, code: "busy" });
  });
  it("母體跟著貼圖換：幼貓貼圖換回成貓舊貼圖時，母體也換回成貓", async () => {
    modelRow = row({ status: "ready", albedo_path: "k.png", prev_albedo_path: "a.png", base_version: "kitten-v1", meta: { prev_base_version: "v1" } });
    expect(await sbRestore(ID, "換回來")).toEqual({ ok: true });
    expect(calls.find(c => c.op === "update")?.args[0]).toMatchObject({
      albedo_path: "a.png", prev_albedo_path: "k.png", base_version: "v1", meta: { prev_base_version: "kitten-v1" },
    });
  });
  it("成功：目前版與上一版互換、寫稽核", async () => {
    modelRow = row({ status: "ready", albedo_path: "a.png", prev_albedo_path: "b.png" });
    expect(await sbRestore(ID, "顏色不對")).toEqual({ ok: true });
    expect(calls.find(c => c.op === "update")?.args[0]).toMatchObject({ albedo_path: "b.png", prev_albedo_path: "a.png", base_version: null });
    expect(calls.find(c => c.op === "rpc")?.args[1]).toMatchObject({ p_action: "restore_texture", p_reason: "顏色不對" });
  });
});

describe("sbListCats 不被自動採用／排程卡住（#285）", () => {
  beforeEach(() => { calls.length = 0; afterTasks.length = 0; modelRow = null; jobRows = []; });

  it("清單先回傳，採用貼圖與自動排程放到 after() 背景執行", async () => {
    variantRows = [{ model_id: ID, body_type: "kitten", albedo_path: `${ID}/albedo_kitten.png`, confirmed_albedo: null }];
    await sbListCats();
    expect(calls.some(c => c.op === "update")).toBe(false);
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]();
    expect(updateWith("confirmed_albedo")).toMatchObject({ confirmed_albedo: `${ID}/albedo_kitten.png` });
  });
});
