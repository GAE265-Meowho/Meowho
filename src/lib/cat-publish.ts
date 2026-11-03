// 準備中 → 準備出發找新主人（規格 09 §5.1、§5.2；資料庫 0017 的 meow_cat_publish_check／meow_publish_cat）。
// 3D 貓：中途用的背景產生流程（AI 三視角 → 紋理貼圖）還沒接上，先由 /api/cats/[id]/model 建一筆「預設 3D 貓」（母體＋預設貼圖），
//   中途一樣要按「確認使用」。接真正流程的位置寫在 docs/modules/household-cats.md「中途的 3D 貓」。

export interface PublishCheck { model_confirmed: boolean; tasks_ready: boolean; tasks_source: "ai" | "manual" | "default" | null }
export interface MissingItem { key: "model" | "tasks"; label: string; href: string }

export function publishChecklist(check: PublishCheck | null, catId: string) {
  const missing: MissingItem[] = [];
  if (!check?.model_confirmed) missing.push({ key: "model", label: "3D 模型還沒確認", href: `/cats/${catId}#model` });
  if (!check?.tasks_ready) missing.push({ key: "tasks", label: "任務還沒完成", href: `/cats/${catId}/tasks` });
  return { canPublish: Boolean(check) && missing.length === 0, missing, usesDefault: check?.tasks_source === "default" };
}

/** 預設 3D 貓的貼圖標記：預覽時用母體自己的貼圖 */
export const DEFAULT_ALBEDO = "default";

const pad = (n: number) => String(n).padStart(2, "0");
/** meow_cat_models.id 的格式：cat_YYYYMMDD_HHMMSS（UTC） */
export const modelIdAt = (d: Date) =>
  `cat_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

export const bodyOf = (lifeStage: string | null) => (lifeStage === "kitten" ? "kitten" : "adult") as "adult" | "kitten";

export function defaultModelRows(cat: { id: string; name: string; life_stage: string | null; photo_paths: string[] | null }, userId: string, modelId: string) {
  return {
    model: {
      id: modelId, name: cat.name.slice(0, 40), owner_type: "member", owner_id: userId, cat_id: cat.id, status: "ready",
      photo_path: cat.photo_paths?.[0] ?? "", meta: { source: "default" }, created_by: userId,
    },
    variant: { model_id: modelId, body_type: bodyOf(cat.life_stage), albedo_path: DEFAULT_ALBEDO },
  };
}
