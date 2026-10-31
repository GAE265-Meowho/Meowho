// 貓咪模型狀態推導與上下架條件（規格書 04 §2.5）
import { describe, expect, it } from "vitest";
import { canPublish, deriveStatus } from "./types";

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
