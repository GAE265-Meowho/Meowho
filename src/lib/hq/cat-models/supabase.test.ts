// 貓咪模型 Supabase 實作（#88）：新增（簽上傳網址→建草稿）、產生、換版的檢查與寫入內容。用假的 Supabase client，不連線。
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table?: string; op: string; args: unknown[] };
const calls: Call[] = [];
let user: { id: string } | null = { id: "u-1" };
let files: { name: string }[] = [];
let insertError: { code: string } | null = null;
let modelRow: Record<string, unknown> | null = null;

/** 夠用的假 client：記下每次呼叫，回傳測試設定的結果 */
function fakeClient() {
  const query = (table: string) => {
    const q = {
      select: (...a: unknown[]) => { calls.push({ table, op: "select", args: a }); return q; },
      eq: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: table === "meow_cat_models" ? modelRow : null, error: null }),
      insert: async (row: unknown) => { calls.push({ table, op: "insert", args: [row] }); return { error: insertError }; },
      update: (row: unknown) => { calls.push({ table, op: "update", args: [row] }); return { eq: async () => ({ error: null }) }; },
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
      }),
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => fakeClient() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => null }));

const { sbAddExtraPhoto, sbCreateCat, sbPhotoUpload, sbQueuePaint, sbRestore } = await import("./supabase");

const ID = "cat_20261101_090507";
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, name: "小虎", owner_type: "template", status: "draft", profile: { age_months: 3 }, photo_path: `${ID}/photo.png`,
  photo_view: null, fill_pattern: null, albedo_path: null, prev_albedo_path: null, base_version: null, meta: {},
  created_at: "2026-11-01T01:00:00Z", updated_at: "2026-11-01T01:00:00Z", ...over,
});

beforeEach(() => { calls.length = 0; user = { id: "u-1" }; files = []; insertError = null; modelRow = row(); });

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
    expect(await sbCreateCat({ id: ID, photoPath: `${ID}/photo.png`, name: " 小虎 ", ageMonths: "3", weightKg: "", notes: "x" }))
      .toEqual({ ok: true, id: ID });
    const insert = calls.find(c => c.op === "insert")!;
    expect(insert.table).toBe("meow_cat_models");
    expect(insert.args[0]).toMatchObject({
      id: ID, name: "小虎", owner_type: "template", status: "draft", photo_path: `${ID}/photo.png`, created_by: "u-1",
      profile: { age_months: 3, weight_kg: null, notes: "x" },
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

describe("sbAddExtraPhoto（補傳正面／背部花紋，#107）", () => {
  it("路徑對且已上傳：合併進 profile.extra_photos", async () => {
    files = [{ name: "photo.png" }, { name: "photo_back.webp" }];
    modelRow = row({ profile: { age_months: 3, extra_photos: { front: `${ID}/photo_front.jpg` } } });
    expect(await sbAddExtraPhoto(ID, "back", `${ID}/photo_back.webp`)).toEqual({ ok: true });
    const update = calls.find(c => c.op === "update")!;
    expect(update.args[0]).toEqual({ profile: { age_months: 3, extra_photos: { front: `${ID}/photo_front.jpg`, back: `${ID}/photo_back.webp` } } });
  });
  it("角度不對、路徑不是自己的、還沒上傳：拒絕且不更新", async () => {
    files = [{ name: "photo.png" }];
    expect(await sbAddExtraPhoto(ID, "side", `${ID}/photo_side.png`)).toEqual({ ok: false, code: "invalid_option" });
    expect(await sbAddExtraPhoto(ID, "front", `cat_20261101_000000/photo_front.png`)).toEqual({ ok: false, code: "photo_invalid" });
    expect(await sbAddExtraPhoto(ID, "front", `${ID}/photo_front.png`)).toEqual({ ok: false, code: "photo_invalid" });
    expect(calls.some(c => c.op === "update")).toBe(false);
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
    insertError = { code: "23505" };
    expect(await sbQueuePaint(ID, "front", "tabby")).toEqual({ ok: false, code: "busy" });
  });
  it("成功：新增 queued 任務、貓改排隊中、寫稽核", async () => {
    expect(await sbQueuePaint(ID, "left", "tabby")).toEqual({ ok: true });
    expect(calls.find(c => c.op === "insert")).toMatchObject({ table: "meow_cat_model_jobs", args: [{ model_id: ID, status: "queued", view: "left", fill: "tabby" }] });
    expect(calls.find(c => c.op === "update")?.args[0]).toMatchObject({ status: "queued" });
    expect(calls.find(c => c.op === "rpc")?.args[1]).toMatchObject({ p_action: "generate_model", p_target_id: ID, p_detail: { body: "kitten" } });
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
