import { describe, expect, it } from "vitest";
import { DEFAULT_ALBEDO, aiViewsPhase, albedoSrc, catBaseUrl, defaultModelRows, modelIdAt, publishChecklist } from "./cat-publish";

describe("準備出發找新主人的兩項檢查（規格 09 §5.2）", () => {
  it("兩項都完成才能按", () => {
    expect(publishChecklist({ model_confirmed: true, tasks_ready: true, tasks_source: "ai" }, "c1")).toMatchObject({ canPublish: true, missing: [], usesDefault: false });
  });
  it("沒完成時列出還差哪一項、附上前往的連結", () => {
    const r = publishChecklist({ model_confirmed: false, tasks_ready: false, tasks_source: null }, "c1");
    expect(r.canPublish).toBe(false);
    expect(r.missing).toEqual([
      { key: "model", label: "3D 模型還沒確認", href: "/cats/c1#model" },
      { key: "tasks", label: "任務還沒完成", href: "/cats/c1/tasks" },
    ]);
  });
  it("用系統預設任務出發要再提醒一次", () => {
    expect(publishChecklist({ model_confirmed: true, tasks_ready: true, tasks_source: "default" }, "c1").usesDefault).toBe(true);
  });
  it("讀不到（不是這隻貓的中途）就不能按", () => {
    expect(publishChecklist(null, "c1").canPublish).toBe(false);
  });
});

describe("預設 3D 貓（真正的背景產生流程完成前先用）", () => {
  it("模型 id 符合 meow_cat_models 的格式", () => {
    expect(modelIdAt(new Date(Date.UTC(2026, 10, 4, 1, 2, 3)))).toBe("cat_20261104_010203");
  });
  it("綁這隻貓、屬於中途；體型依年齡層，貼圖用母體預設", () => {
    const rows = defaultModelRows({ id: "c1", name: "橘子", life_stage: "kitten", photo_paths: ["u/c1/a.jpg"] }, "u1", "cat_20261104_010203");
    expect(rows.model).toMatchObject({ id: "cat_20261104_010203", cat_id: "c1", owner_type: "member", owner_id: "u1", status: "ready", photo_path: "u/c1/a.jpg", created_by: "u1" });
    expect(rows.variant).toEqual({ model_id: "cat_20261104_010203", body_type: "kitten", albedo_path: DEFAULT_ALBEDO });
    expect(defaultModelRows({ id: "c1", name: "老橘", life_stage: "senior", photo_paths: [] }, "u1", "cat_x").variant.body_type).toBe("adult");
  });
  it("#185 中途填的月齡帶進模型 profile；沒填就空的", () => {
    expect(defaultModelRows({ id: "c1", name: "橘子", life_stage: "kitten", photo_paths: [], est_age_months: 4 }, "u1", "cat_x").model.profile).toEqual({ age_months: 4 });
    expect(defaultModelRows({ id: "c1", name: "橘子", life_stage: "kitten", photo_paths: [] }, "u1", "cat_x").model.profile).toEqual({});
  });
});

describe("#188 前台 AI 三視角預覽狀態", () => {
  const r = (o: Partial<Parameters<typeof aiViewsPhase>[0] & object>) => ({ started: true, running: [], views: {}, errors: {}, ...o });
  it("還沒開始、產生中、完成、失敗", () => {
    expect(aiViewsPhase(null)).toBe("none");
    expect(aiViewsPhase(r({ started: false }))).toBe("none");
    expect(aiViewsPhase(r({ running: ["left"] }))).toBe("running");
    expect(aiViewsPhase(r({ views: { left: "a", front: "b", back: "c" } }))).toBe("done");
    expect(aiViewsPhase(r({ views: { left: "a", front: "b", back: "c" }, errors: { back: "逾時" } }))).toBe("failed");
    expect(aiViewsPhase(r({ views: { left: "a" } }))).toBe("failed");
  });
});

describe("前台 3D 貓的貼圖與母體（和 MeowHQ 預覽一致）", () => {
  const URL = "https://x.supabase.co/";
  it("bucket 路徑轉成 meow-cat-models 的公開網址", () => {
    expect(albedoSrc("cat_20261101_183700/paint_albedo.png", URL))
      .toBe("https://x.supabase.co/storage/v1/object/public/meow-cat-models/cat_20261101_183700/paint_albedo.png");
  });
  it("預設貼圖、沒有貼圖回 null（用母體自己的貼圖）；完整網址原樣", () => {
    expect(albedoSrc(DEFAULT_ALBEDO, URL)).toBeNull();
    expect(albedoSrc(null, URL)).toBeNull();
    expect(albedoSrc("https://cdn.example/a.png", URL)).toBe("https://cdn.example/a.png");
  });
  it("母體走 MeowHQ 同一支 API", () => {
    expect(catBaseUrl("adult")).toBe("/api/hq/cat-models/base");
    expect(catBaseUrl("kitten")).toBe("/api/hq/cat-models/base?body=kitten");
  });
});
