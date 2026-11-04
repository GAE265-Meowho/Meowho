import { describe, expect, it } from "vitest";
import { DEFAULT_ALBEDO, defaultModelRows, modelIdAt, publishChecklist } from "./cat-publish";

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
