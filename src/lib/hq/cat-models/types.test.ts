// 貓咪模型狀態推導與上下架條件（規格書 04 §2.5）
import { describe, expect, it } from "vitest";
import { bodyFor, CAT_ID_RE, canPublish, newCatId, ownPhotoPath, photoExt, profileNumber, deriveStatus, elapsedMinutes, isJobActive, queueStalled } from "./types";

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
  it("上架、下架記錄決定狀態", () => {
    expect(deriveStatus({ hasAlbedo: true, job: { status: "done" }, publication: "published" })).toBe("published");
    expect(deriveStatus({ hasAlbedo: true, job: { status: "done" }, publication: "unpublished" })).toBe("unpublished");
  });
  it("沒有貼圖的貓就算有上架記錄也是草稿（不能上架沒有貼圖的貓）", () => {
    expect(deriveStatus({ hasAlbedo: false, job: null, publication: "published" })).toBe("draft");
  });
});

describe("canPublish", () => {
  it("已完成、已下架可以上架", () => {
    expect(canPublish("ready", "publish")).toBe(true);
    expect(canPublish("unpublished", "publish")).toBe(true);
  });
  it("草稿、排隊、生成中、失敗、已上架不能上架", () => {
    for (const s of ["draft", "queued", "running", "failed", "published"] as const) expect(canPublish(s, "publish")).toBe(false);
  });
  it("只有已上架可以下架", () => {
    expect(canPublish("published", "unpublish")).toBe(true);
    for (const s of ["draft", "ready", "unpublished", "failed"] as const) expect(canPublish(s, "unpublish")).toBe(false);
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
