// 準備中 → 準備出發找新主人（規格 09 §5.1；資料庫 0017 的 meow_cat_publish_check、0030 的 meow_publish_cat）。
// 0030 起中途不用出任務：只要確認 3D 模型就能出發；任務在領養人按「進行領養任務」時才產生（lib/task-worker.ts）。
// 3D 貓：中途用的背景產生流程（AI 三視角 → 紋理貼圖）還沒接上，先由 /api/cats/[id]/model 建一筆「預設 3D 貓」（母體＋預設貼圖），
//   中途一樣要按「確認使用」。接真正流程的位置寫在 docs/modules/household-cats.md「中途的 3D 貓」。

export interface PublishCheck { model_confirmed: boolean; tasks_ready: boolean; tasks_source: "ai" | "manual" | "default" | null }
export interface MissingItem { key: "model"; label: string; href: string }

export function publishChecklist(check: PublishCheck | null, catId: string) {
  const missing: MissingItem[] = [];
  if (!check?.model_confirmed) missing.push({ key: "model", label: "3D 模型還沒確認", href: `/cats/${catId}#model` });
  return { canPublish: Boolean(check) && missing.length === 0, missing };
}

/** 預設 3D 貓的貼圖標記：預覽時用母體自己的貼圖 */
export const DEFAULT_ALBEDO = "default";

/** 貼圖所在的公開 bucket（同 lib/hq/cat-models/supabase.ts 的 MODEL_BUCKET；那支是 server-only，前台不能 import） */
const MODEL_BUCKET = "meow-cat-models";

/**
 * meow_cat_model_variants 的 albedo_path／confirmed_albedo → CatPreview 要的網址。
 * paint worker 存的是 bucket 裡的路徑（例如 cat_…/paint_albedo.png），不能直接當網址用，否則載入失敗會退回母體的灰色預設貼圖。
 * 預設 3D 貓（DEFAULT_ALBEDO）或沒有貼圖回 null＝用母體自己的貼圖；完整網址原樣回傳。
 */
export function albedoSrc(path: string | null | undefined, supabaseUrl: string): string | null {
  if (!path || path === DEFAULT_ALBEDO) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${MODEL_BUCKET}/${path.replace(/^\//, "")}`;
}

/** 母體 glb：和 MeowHQ 預覽用同一支（/api/hq/cat-models/base），貼圖是照這個母體畫的，換成別版母體 UV 會對不上 */
export const catBaseUrl = (body: "adult" | "kitten") => (body === "kitten" ? "/api/hq/cat-models/base?body=kitten" : "/api/hq/cat-models/base");

const pad = (n: number) => String(n).padStart(2, "0");
/** meow_cat_models.id 的格式：cat_YYYYMMDD_HHMMSS（UTC） */
export const modelIdAt = (d: Date) =>
  `cat_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

export const bodyOf = (lifeStage: string | null) => (lifeStage === "kitten" ? "kitten" : "adult") as "adult" | "kitten";

type CatForModel = {
  id: string; name: string; life_stage: string | null; photo_paths: string[] | null; est_age_months?: number | null;
  sex?: string | null; care?: unknown;
};

/** 前台貓的資料 → MeowHQ 模型 profile（月齡、性別、體重；沒填的不寫） */
export function profileFromCat(cat: Pick<CatForModel, "est_age_months" | "sex" | "care">) {
  const weight = (cat.care as { weightKg?: unknown } | null | undefined)?.weightKg;
  return {
    ...(typeof cat.est_age_months === "number" ? { age_months: cat.est_age_months } : {}),
    ...(cat.sex === "male" || cat.sex === "female" ? { gender: cat.sex } : {}),
    ...(typeof weight === "number" && Number.isFinite(weight) ? { weight_kg: weight } : {}),
  };
}

export function defaultModelRows(cat: CatForModel, userId: string, modelId: string) {
  return {
    model: {
      id: modelId, name: cat.name.slice(0, 40), owner_type: "member", owner_id: userId, cat_id: cat.id, status: "ready",
      photo_path: cat.photo_paths?.[0] ?? "", meta: { source: "default" }, created_by: userId,
      // #185：中途填的大約月齡、性別、體重帶進模型，MeowHQ 製作頁（虛擬貓咪檔案）與 AI 三視角用
      profile: profileFromCat(cat),
    },
    variant: { model_id: modelId, body_type: bodyOf(cat.life_stage), albedo_path: DEFAULT_ALBEDO },
  };
}

/** 前台 AI 三視角預覽（#188）：GET /api/cats/[id]/model/views 的回應 */
export interface AiViewsResponse { started: boolean; running: string[]; views: Partial<Record<"left" | "front" | "back", string | null>>; errors: Partial<Record<string, string>> }
export type AiViewsPhase = "none" | "running" | "done" | "failed";

/** 還沒開始／產生中／三張都好了／有失敗（失敗時畫面請中途聯絡或換照片，管理員可在 MeowHQ 重新產生） */
export function aiViewsPhase(r: AiViewsResponse | null): AiViewsPhase {
  if (!r?.started) return "none";
  if (r.running.length) return "running";
  if (Object.values(r.errors).some(Boolean)) return "failed";
  return (["left", "front", "back"] as const).every((v) => r.views[v]) ? "done" : "failed";
}
