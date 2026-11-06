// 貓咪模型狀態推導與上下架條件（規格書 04 §2.5）
import { describe, expect, it } from "vitest";
import { bodyFor, CAT_ID_RE, formatCatTime, newCatId, normalizeStatus, ownPhotoPath, photoExt, profileNumber, deriveStatus, elapsedMinutes, isJobActive, queueStalled } from "./types";

describe("deriveStatus", () => {
  it("沒有貼圖也沒有任務＝草稿", () => expect(deriveStatus({ hasAlbedo: false, job: null, publication: null })).toBe("draft"));
  it("排隊中、生成中優先於其他", () => {
    expect(deriveStatus({ hasAlbedo: true, job: { status: "queued" }, publication: "published" })).toBe("queued");
    expect(deriveStatus({ hasAlbedo: true, job: { status: "running" }, publication: "published" })).toBe("running");
  });
  it("任務失敗＝失敗（即使有舊貼圖）", () => {
    expect(deriveStatus({ hasAlbedo: false, job: { status: "error" }, publication: null })).toBe("failed");
    expect(deriveStatus({ hasAlbedo: true, job: { status: "error" }, publication: null })).toBe("failed");
  });
  it("有貼圖、任務完成＝已完成", () => expect(deriveStatus({ hasAlbedo: true, job: { status: "done" }, publication: null })).toBe("ready"));
  it("上架／下架已移除（#102）：舊的上架、下架記錄一律視為已完成", () => {
    expect(deriveStatus({ hasAlbedo: true, job: { status: "done" }, publication: "published" })).toBe("ready");
    expect(deriveStatus({ hasAlbedo: true, job: { status: "done" }, publication: "unpublished" })).toBe("ready");
  });
  it("沒有貼圖的貓就算有上架記錄也是草稿（不能上架沒有貼圖的貓）", () => {
    expect(deriveStatus({ hasAlbedo: false, job: null, publication: "published" })).toBe("draft");
  });
});

describe("任務時間判斷", () => {
  const queued = "2026-10-31T10:00:00.000Z";
  const at = (min: number) => Date.parse(queued) + min * 60000;
  it("isJobActive：只有排隊中與生成中", () => {
    expect(isJobActive("queued")).toBe(true);
    expect(isJobActive("running")).toBe(true);
    expect(isJobActive("ready")).toBe(false);
    expect(isJobActive("failed")).toBe(false);
  });
  it("排隊超過 2 分鐘才提示 worker 可能沒開", () => {
    expect(queueStalled("queued", queued, at(1))).toBe(false);
    expect(queueStalled("queued", queued, at(3))).toBe(true);
  });
  it("生成中、其他狀態或時間不合法都不提示", () => {
    expect(queueStalled("running", queued, at(10))).toBe(false);
    expect(queueStalled("ready", queued, at(10))).toBe(false);
    expect(queueStalled("queued", null, at(10))).toBe(false);
    expect(queueStalled("queued", "壞掉", at(10))).toBe(false);
  });
  it("elapsedMinutes：整分鐘、不為負、不合法回 null", () => {
    expect(elapsedMinutes(queued, at(4) + 30000)).toBe(4);
    expect(elapsedMinutes(queued, at(-5))).toBe(0);
    expect(elapsedMinutes(null, at(1))).toBeNull();
    expect(elapsedMinutes("壞掉", at(1))).toBeNull();
  });
});

describe("bodyFor（成貓／幼貓母體，TBD-C）", () => {
  it("還沒有貼圖：≤6 個月幼貓、其他（含沒填）成貓", () => {
    expect(bodyFor({ baseVersion: null, hasAlbedo: false, ageMonths: 3 })).toBe("kitten");
    expect(bodyFor({ baseVersion: null, hasAlbedo: false, ageMonths: 6 })).toBe("kitten");
    expect(bodyFor({ baseVersion: null, hasAlbedo: false, ageMonths: 6.5 })).toBe("adult");
    expect(bodyFor({ baseVersion: null, hasAlbedo: false, ageMonths: null })).toBe("adult");
  });
  it("有貼圖：跟著畫貼圖的母體（UV 不同，不能換）", () => {
    expect(bodyFor({ baseVersion: "kitten-v1", hasAlbedo: true, ageMonths: 24 })).toBe("kitten");
    expect(bodyFor({ baseVersion: "adult-v1", hasAlbedo: true, ageMonths: 3 })).toBe("adult");
  });
  it("舊資料（v1 或沒記錄）有貼圖＝成貓：以前只有成貓母體", () => {
    expect(bodyFor({ baseVersion: "v1", hasAlbedo: true, ageMonths: 5 })).toBe("adult");
    expect(bodyFor({ baseVersion: null, hasAlbedo: true, ageMonths: 5 })).toBe("adult");
  });
});

describe("新增貓咪的共用檢查（本機與 Supabase 共用）", () => {
  it("newCatId：cat_YYYYMMDD_HHMMSS", () => {
    expect(newCatId(new Date(2026, 10, 1, 9, 5, 7))).toBe("cat_20261101_090507");
    expect(CAT_ID_RE.test(newCatId(new Date()))).toBe(true);
  });
  it("photoExt：只收 JPG／PNG／WebP", () => {
    expect(photoExt("image/jpeg")).toBe("jpg");
    expect(photoExt("image/png")).toBe("png");
    expect(photoExt("image/webp")).toBe("webp");
    expect(photoExt("image/gif")).toBeNull();
    expect(photoExt(undefined)).toBeNull();
  });
  it("ownPhotoPath：照片路徑只能是自己 ID 底下的 photo.<副檔名>", () => {
    const id = "cat_20261101_090507";
    expect(ownPhotoPath(id, `${id}/photo.jpg`)).toBe(true);
    expect(ownPhotoPath(id, "cat_20261101_090508/photo.jpg")).toBe(false);
    expect(ownPhotoPath(id, `${id}/../x/photo.jpg`)).toBe(false);
    expect(ownPhotoPath(id, `${id}/photo.gif`)).toBe(false);
  });
  it("profileNumber：空白、負數、非數字都當沒填", () => {
    expect(profileNumber("3")).toBe(3);
    expect(profileNumber(4.5)).toBe(4.5);
    expect(profileNumber("")).toBeNull();
    expect(profileNumber("-1")).toBeNull();
    expect(profileNumber("abc")).toBeNull();
    expect(profileNumber(undefined)).toBeNull();
  });
});

describe("normalizeStatus（#102）", () => {
  it("資料庫的 published／unpublished 顯示成已完成，其他不變", () => {
    expect(normalizeStatus("published")).toBe("ready");
    expect(normalizeStatus("unpublished")).toBe("ready");
    for (const s of ["draft", "queued", "running", "ready", "failed"] as const) expect(normalizeStatus(s)).toBe(s);
  });
});

describe("formatCatTime（#102）", () => {
  it("帶時區的時間轉台北時間，顯示到時、分", () => expect(formatCatTime("2026-11-01T14:44:54Z")).toBe("2026/11/01 22:44"));
  it("沒有時區的本機時間照原樣顯示", () => expect(formatCatTime("2026-10-31T15:39:12")).toBe("2026/10/31 15:39"));
});

describe("catProgress（#118；#129 改 4 步）", () => {
  const base = { hasAlbedo: false, status: "draft" as const, aiViews: [] as string[], aiRunning: [] as string[] };
  it("依四步驟回傳第幾步與狀態", async () => {
    const { catProgress } = await import("./types");
    expect(catProgress({ ...base })).toEqual({ step: 1, text: "1/4 上傳照片", tone: "mute" });
    expect(catProgress({ ...base, aiRunning: ["left"] })).toEqual({ step: 2, text: "2/4 AI 三視角・產生中", tone: "warn" });
    expect(catProgress({ ...base, aiViews: ["left", "front", "back"] })).toEqual({ step: 2, text: "2/4 AI 三視角・完成", tone: "mute" });
    expect(catProgress({ ...base, status: "queued" })).toEqual({ step: 3, text: "3/4 紋理貼圖・產生中", tone: "warn" });
    expect(catProgress({ ...base, status: "running" })).toEqual({ step: 3, text: "3/4 紋理貼圖・產生中", tone: "warn" });
    expect(catProgress({ ...base, status: "failed" })).toEqual({ step: 3, text: "3/4 紋理貼圖・失敗", tone: "danger" });
    expect(catProgress({ ...base, hasAlbedo: true, status: "ready" })).toEqual({ step: 4, text: "完成", tone: "" });
  });
  it("貼圖待確認：停在第 3 步", async () => {
    const { catProgress, catStepStates } = await import("./types");
    const pending = { ...base, hasAlbedo: true, status: "ready" as const, texture: { state: "pending" as const, preview: null, previewBody: "adult" as const } };
    expect(catProgress(pending)).toEqual({ step: 3, text: "3/4 紋理貼圖・待確認", tone: "warn" });
    expect(catStepStates(pending)).toEqual(["done", "done", "active", "todo"]);
    expect(catStepStates({ ...base, status: "failed" })).toEqual(["done", "done", "failed", "todo"]);
    expect(catStepStates({ ...base, hasAlbedo: true, status: "ready" })).toEqual(["done", "done", "done", "done"]);
  });
  it("有貼圖但又在重新產生：顯示產生中", async () => {
    const { catProgress } = await import("./types");
    expect(catProgress({ ...base, hasAlbedo: true, status: "running" }).text).toBe("3/4 紋理貼圖・產生中");
  });
});

describe("雙體型進度（成貓／幼貓各一條）", () => {
  const tex = (state: "none" | "pending" | "confirmed") =>
    ({ texture: { state, preview: state === "confirmed" ? "albedo" as const : null, previewBody: "adult" as const } });
  // 主表留著舊的確認記錄（待確認），體型表已確認：要以體型表為準
  const cat = {
    hasAlbedo: true, status: "ready" as const, aiViews: ["left", "front", "back"], aiRunning: [] as string[], body: "kitten" as const,
    texture: tex("pending").texture, variantStorage: true, jobBody: "kitten" as const,
    bodyVariants: { kitten: tex("confirmed") },
  };
  it("確認寫在體型表：該體型顯示完成，另一體型還沒做停在第 2 步", async () => {
    const { catProgresses } = await import("./types");
    expect(catProgresses(cat).map(p => [p.body, p.text])).toEqual([["adult", "2/4 AI 三視角・完成"], ["kitten", "完成"]]);
  });
  it("任務狀態只算在它畫的體型上", async () => {
    const { catProgresses } = await import("./types");
    expect(catProgresses({ ...cat, status: "running", jobBody: "adult" }).map(p => p.text)).toEqual(["3/4 紋理貼圖・產生中", "完成"]);
  });
  it("兩個體型都確認才算「完成」組；待確認計數、貓咪頁連結看各體型", async () => {
    const { catListGroup, countTexturePending, hasConfirmedLook } = await import("./types");
    expect(catListGroup(cat)).toBe("other");
    expect(catListGroup({ ...cat, bodyVariants: { adult: tex("confirmed"), kitten: tex("confirmed") } })).toBe("done");
    expect(countTexturePending([cat])).toBe(0);
    expect(countTexturePending([{ ...cat, bodyVariants: { adult: tex("pending") } }])).toBe(1);
    expect(hasConfirmedLook(cat)).toBe(true);
  });
  it("沒有雙體型的舊站台：只有一條，沿用主表", async () => {
    const { catProgresses } = await import("./types");
    expect(catProgresses({ ...cat, variantStorage: false }).map(p => p.text)).toEqual(["3/4 紋理貼圖・待確認"]);
  });
});

describe("貼圖確認（#129）", () => {
  const rows = { baseVersion: "adult-v1", prevBaseVersion: "kitten-v1", ageMonths: 12 };
  it("舊資料沒有確認欄位：目前版視為已確認", async () => {
    const { textureInfo } = await import("./types");
    expect(textureInfo({ ...rows, albedo: "a2", prev: "a1", confirmed: undefined })).toEqual({ state: "confirmed", preview: "albedo", previewBody: "adult" });
  });
  it("沒有貼圖：none", async () => {
    const { textureInfo } = await import("./types");
    expect(textureInfo({ ...rows, albedo: null, prev: null, confirmed: null }).state).toBe("none");
  });
  it("新貼圖待確認：預覽用已確認的上一版，母體跟著上一版", async () => {
    const { textureInfo } = await import("./types");
    expect(textureInfo({ ...rows, albedo: "a2", prev: "a1", confirmed: "a1" })).toEqual({ state: "pending", preview: "albedo_prev", previewBody: "kitten" });
  });
  it("第一次產生、從未確認：待確認且沒有可預覽的貼圖", async () => {
    const { textureInfo } = await import("./types");
    expect(textureInfo({ ...rows, albedo: "a1", prev: null, confirmed: null })).toEqual({ state: "pending", preview: null, previewBody: "adult" });
  });
  it("確認後：目前版", async () => {
    const { textureInfo } = await import("./types");
    expect(textureInfo({ ...rows, albedo: "a2", prev: "a1", confirmed: "a2" }).preview).toBe("albedo");
  });
  it("重新產生前丟掉未確認的貼圖，已確認的換回目前版", async () => {
    const { discardPending } = await import("./types");
    expect(discardPending({ albedo: "a2", prev: "a1", confirmed: "a1", baseVersion: "adult-v1", prevBaseVersion: "kitten-v1" }))
      .toEqual({ albedo: "a1", prev: null, baseVersion: "kitten-v1", remove: "a2" });
    expect(discardPending({ albedo: "a2", prev: "a1", confirmed: "a2", baseVersion: null, prevBaseVersion: null })).toBeNull();
    expect(discardPending({ albedo: "a1", prev: null, confirmed: null, baseVersion: null, prevBaseVersion: null })).toBeNull();
    expect(discardPending({ albedo: "a2", prev: "a1", confirmed: undefined, baseVersion: null, prevBaseVersion: null })).toBeNull();
  });
  it("待辦：計算待確認的貓", async () => {
    const { countTexturePending } = await import("./types");
    const t = (state: "none" | "pending" | "confirmed") => ({ hasAlbedo: true, body: "adult" as const, texture: { state, preview: null, previewBody: "adult" as const } });
    expect(countTexturePending([t("pending"), t("confirmed"), t("pending"), { hasAlbedo: true, body: "adult" as const }])).toBe(2);
  });
});

describe("jobStage（#129 任務階段）", () => {
  const c = (jobStatus: "queued" | "running" | "done" | "error" | null, jobStep: string | null = null) => ({ status: "running" as const, jobStatus, jobStep });
  it("依 worker 回報的步驟文字對應階段", async () => {
    const { jobStage } = await import("./types");
    expect(jobStage(c(null))).toBeNull();
    expect(jobStage(c("queued", "排隊中"))).toEqual({ index: 0, failed: false, stalled: false });
    expect(jobStage(c("queued"), true)?.stalled).toBe(true);
    expect(jobStage(c("running", "照片去背"))?.index).toBe(1);
    expect(jobStage(c("running", "載入模型"))?.index).toBe(2);
    expect(jobStage(c("running", "AI 上色（約 3~6 分鐘）"))?.index).toBe(3);
    expect(jobStage(c("running", "補花紋與眼皮邊"))?.index).toBe(4);
    expect(jobStage(c("running", "上傳貼圖"))?.index).toBe(5);
    expect(jobStage(c("done"))).toEqual({ index: 6, failed: false, stalled: false });
    expect(jobStage(c("error", "AI 上色"))).toEqual({ index: 3, failed: true, stalled: false });
  });
});
