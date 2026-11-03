// 貓咪模型｜Supabase 實作（規格書 04 §3；PR 3、#88）
// 讀取用登入者（失敗退回 service role）；寫入一律用登入者的 session，讓 RLS 的 virtual_assets 權限把關。
// 照片由瀏覽器直傳 Storage（伺服器只簽上傳網址），避開 Vercel 約 4.5 MB 的請求大小上限。
// 產生貼圖由本機 paint_worker.py --supabase 領取 meow_cat_model_jobs，完成後寫回 albedo_path／base_version。
import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { ImageGenError, imageConfig } from "@/lib/ai/image";
import { azureEdit, failAll, generateViews } from "./ai-views";
import { analyzeAge } from "./ai-analyze";
import { viewSettings, type StartViewsOptions } from "./view-settings";
import { SUPABASE_URL } from "@/lib/supabase/config";
import {
  baseFileName, bodyFor, EXTRA_VIEWS, finishGenerated, generatedState, GEN_VIEWS, genPhotoName, isGenView, startGenerated, type GeneratedProfile, type GenView, isExtraView, isJobActive, normalizeStatus, viewsReady, ownExtraPhotoPath, type ExtraView, newCatId, ownPhotoPath, photoExt, profileNumber,
  type BodyType, type CatGender, type CatModelStatus, type CatModelView, type FillPattern, type JobStatus, type PhotoView,
  CAT_ID_RE, MAX_PHOTO_BYTES, discardPending, textureInfo,
} from "./types";
import type { FileKind } from "./local";
import { confirmVariant, legacyVariants, prepareVariant, restoreVariant, variantTexture, type Variant, type Variants } from "./variants";

export const PHOTO_BUCKET = "meow-cat-model-photos";
export const MODEL_BUCKET = "meow-cat-models";
export const BASE_DIR = "base/v1";

type Row = {
  id: string;
  name: string;
  owner_type: "template" | "member";
  status: CatModelStatus;
  profile: {
    age_months?: number | null; gender?: CatGender | null; weight_kg?: number | null; notes?: string; extra_photos?: Partial<Record<ExtraView, string>>;
    /** AI 三視角（#110） */
    generated?: GeneratedProfile;
    /** 改用 AI 左側面照上色後，原始上傳照片的路徑（photo_path 換成 AI 照片） */
    original_photo?: string;
    /** 已確認的貼圖路徑（#129）；沒有這個欄位＝舊資料，目前版視為已確認；null＝從未確認 */
    confirmed_albedo?: string | null;
  };
  photo_path: string;
  photo_view: PhotoView | null;
  fill_pattern: FillPattern | null;
  albedo_path: string | null;
  prev_albedo_path: string | null;
  base_version: string | null;
  meta: { seconds?: number; prev_base_version?: string | null } | null;
  created_at: string;
  updated_at: string;
  /** 建立者（#102）：meow_profiles 只有本人或有「用戶權限管理」的管理員讀得到，讀不到時為 null */
  creator?: { display_name: string | null; email: string | null } | null;
  created_by?: string | null;
};

type JobRow = {
  status: JobStatus;
  step: string | null;
  error: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type VariantRow = {
  body_type: BodyType;
  albedo_path: string | null;
  prev_albedo_path: string | null;
  base_version: string | null;
  prev_base_version: string | null;
  confirmed_albedo: string | null;
};

function variantViews(row: Row, records: VariantRow[] | null): NonNullable<CatModelView["bodyVariants"]> {
  const variants: Variants = records ? Object.fromEntries(records.map(v => [v.body_type, {
    albedo: v.albedo_path, prev: v.prev_albedo_path, baseVersion: v.base_version,
    prevBaseVersion: v.prev_base_version, confirmed: v.confirmed_albedo,
  }])) : legacyVariants({
    albedo: row.albedo_path, prev: row.prev_albedo_path, baseVersion: row.base_version,
    prevBaseVersion: row.meta?.prev_base_version ?? null, confirmed: row.profile?.confirmed_albedo,
    ageMonths: row.profile?.age_months ?? null,
  });
  const result: NonNullable<CatModelView["bodyVariants"]> = {};
  for (const body of ["adult", "kitten"] as const) {
    const variant = variants[body];
    if (!variant) continue;
    result[body] = {
      albedoUrl: variant.albedo ? publicObjectUrl(MODEL_BUCKET, variant.albedo) : null,
      prevUrl: variant.prev ? publicObjectUrl(MODEL_BUCKET, variant.prev) : null,
      texture: variantTexture(variants, body), baseVersion: variant.baseVersion,
    };
  }
  return result;
}

export function publicObjectUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`;
}

function viewFromRow(row: Row, job: JobRow | null = null): CatModelView {
  const ageMonths = typeof row.profile?.age_months === "number" ? row.profile.age_months : null;
  const hasAlbedo = Boolean(row.albedo_path);
  return {
    id: row.id,
    name: row.name,
    ownerType: row.owner_type,
    status: normalizeStatus(row.status),
    ageMonths,
    gender: row.profile?.gender ?? null,
    weightKg: typeof row.profile?.weight_kg === "number" ? row.profile.weight_kg : null,
    notes: row.profile?.notes ?? "",
    photoView: row.photo_view,
    fillPattern: row.fill_pattern,
    hasAlbedo,
    hasPrevAlbedo: Boolean(row.prev_albedo_path),
    albedoVersion: row.updated_at,
    body: bodyFor({ baseVersion: row.base_version, hasAlbedo, ageMonths }),
    jobStatus: job?.status ?? null,
    jobQueuedAt: job?.queued_at ?? null,
    jobStartedAt: job?.started_at ?? null,
    jobSeconds: job?.status === "done" && typeof row.meta?.seconds === "number" ? row.meta.seconds : null,
    jobStep: job?.step ?? null,
    jobError: job?.error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // 沒有 created_by 的是直接用 SQL 放進來的示範資料；有但讀不到個人資料時顯示 null（畫面顯示「—」）
    createdBy: row.created_by ? row.creator?.display_name || row.creator?.email || null : "系統",
    extraPhotos: EXTRA_VIEWS.filter(v => row.profile?.extra_photos?.[v]),
    ...generatedState(row.profile?.generated),
    texture: textureInfo({
      albedo: row.albedo_path, prev: row.prev_albedo_path, confirmed: row.profile?.confirmed_albedo,
      baseVersion: row.base_version, prevBaseVersion: row.meta?.prev_base_version, ageMonths,
    }),
  };
}

async function client() {
  return (await getServerSupabase()) ?? getAdminSupabase();
}

/** 寫入用：一定要是登入者（RLS 檢查 virtual_assets）；不退回 service role */
async function userClient() {
  const sb = await getServerSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ? { sb, userId: data.user.id } : null;
}

const WITH_CREATOR = "*, creator:meow_profiles!created_by(display_name,email)";

export async function sbListCats(): Promise<CatModelView[]> {
  const sb = await client();
  if (!sb) return [];
  // 帶出建立者；萬一關聯查詢失敗（例如 schema cache 還沒更新），退回不帶建立者，列表不能因此變空
  let { data, error } = await sb.from("meow_cat_models").select(WITH_CREATOR).order("updated_at", { ascending: false });
  if (error) ({ data, error } = await sb.from("meow_cat_models").select("*").order("updated_at", { ascending: false }));
  if (error || !data) return [];
  return (data as Row[]).map(r => viewFromRow(r));
}

export async function sbGetCat(id: string): Promise<CatModelView | null> {
  const sb = await client();
  if (!sb) return null;
  const { data, error } = await sb.from("meow_cat_models").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  // 製作glb工作區每 3 秒輪詢：帶上最新一筆任務的狀態與步驟
  const { data: job } = await sb.from("meow_cat_model_jobs")
    .select("status,step,error,queued_at,started_at,finished_at")
    .eq("model_id", id).order("queued_at", { ascending: false }).limit(1).maybeSingle();
  const { data: variants, error: variantError } = await sb.from("meow_cat_model_variants").select("body_type,albedo_path,prev_albedo_path,base_version,prev_base_version,confirmed_albedo").eq("model_id", id);
  const variantStorage = !variantError && process.env.CAT_MODEL_VARIANTS_WORKER_READY === "1";
  return { ...viewFromRow(data as Row, (job as JobRow | null) ?? null),
    variantStorage,
    bodyVariants: variantViews(data as Row, variantStorage ? (variants as VariantRow[] | null) ?? [] : null) };
}

export async function sbFileRedirect(id: string, kind: FileKind): Promise<string | null> {
  const sb = await client();
  if (!sb) return null;
  const { data } = await sb.from("meow_cat_models").select("photo_path,albedo_path,prev_albedo_path,profile").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as Pick<Row, "photo_path" | "albedo_path" | "prev_albedo_path" | "profile">;
  // 正面／背部花紋照（#107）也在私有 bucket，用同樣的簽名方式
  // 「原始照片」：改用 AI 左側面照上色後，photo_path 會換成 AI 照片，原始的記在 profile.original_photo
  const photoPath = kind === "photo" ? row.profile?.original_photo ?? row.photo_path
    : kind === "photo_front" || kind === "photo_back" ? row.profile?.extra_photos?.[kind === "photo_front" ? "front" : "back"] ?? null
    : kind === "gen_left" || kind === "gen_front" || kind === "gen_back" ? row.profile?.generated?.views?.[kind.slice(4) as GenView] ?? null
    : null;
  if (photoPath) {
    // 私有 bucket：先用登入者簽、失敗再用 service role
    const trySign = async (c: NonNullable<Awaited<ReturnType<typeof client>>>) => {
      const { data: signed } = await c.storage.from(PHOTO_BUCKET).createSignedUrl(photoPath, 3600);
      return signed?.signedUrl ?? null;
    };
    return (await trySign(sb)) ?? (getAdminSupabase() ? await trySign(getAdminSupabase()!) : null);
  }
  if (kind === "albedo" && row.albedo_path) return publicObjectUrl(MODEL_BUCKET, row.albedo_path);
  if (kind === "albedo_prev" && row.prev_albedo_path) return publicObjectUrl(MODEL_BUCKET, row.prev_albedo_path);
  return null;
}

/** 母體若已上傳回公開網址；尚未上傳回 null（repo 再退回 bundled） */
export async function sbBaseRedirect(body: BodyType = "adult"): Promise<string | null> {
  const sb = getAdminSupabase() ?? (await getServerSupabase());
  if (!sb) return null;
  const name = baseFileName(body);
  const { data, error } = await sb.storage.from(MODEL_BUCKET).list(BASE_DIR, { search: name, limit: 10 });
  if (error || !data?.some(f => f.name === name)) return null;
  return publicObjectUrl(MODEL_BUCKET, `${BASE_DIR}/${name}`);
}

export type UploadTicket = { ok: true; id: string; bucket: string; path: string; token: string };

/** 新增第一步：檢查格式與大小、配一個貓咪 ID、簽一個上傳網址（瀏覽器拿去直傳照片） */
/** 新增第一步：簽上傳網址。帶 extra（#105）時是同一隻貓的正面／背部花紋照，簽 <id>/photo_<角度>.<副檔名> */
export async function sbPhotoUpload(type: unknown, size: unknown, now = new Date(), extra?: { id?: unknown; view?: unknown }): Promise<
  UploadTicket | { ok: false; code: "photo_invalid" | "photo_too_large" | "permission_denied" }
> {
  const ext = photoExt(type);
  if (!ext || typeof size !== "number" || size <= 0) return { ok: false, code: "photo_invalid" };
  if (size > MAX_PHOTO_BYTES) return { ok: false, code: "photo_too_large" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  if (extra && (!isExtraView(extra.view) || typeof extra.id !== "string" || !CAT_ID_RE.test(extra.id))) return { ok: false, code: "photo_invalid" };
  const id = extra ? String(extra.id) : newCatId(now);
  const path = extra ? `${id}/photo_${extra.view}.${ext}` : `${id}/photo.${ext}`;
  // 補傳或換一張（#107）時檔案可能已存在，允許覆蓋
  const { data, error } = await user.sb.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path, extra ? { upsert: true } : undefined);
  if (error || !data) return { ok: false, code: "permission_denied" };
  return { ok: true, id, bucket: PHOTO_BUCKET, path, token: data.token };
}

export type SbCreateInput = {
  id?: unknown; photoPath?: unknown; name: unknown; gender?: unknown; ageMonths?: unknown; weightKg?: unknown; notes?: unknown;
  /** 正面、背部花紋照片已上傳的路徑（#105，選填） */
  extraPaths?: Partial<Record<string, unknown>>;
};

/** 新增第二步：照片已傳好，建立草稿（不會自動開始生成） */
export async function sbCreateCat(input: SbCreateInput): Promise<
  { ok: true; id: string } | { ok: false; code: "name_required" | "photo_invalid" | "permission_denied" | "busy" }
> {
  const name = String(input.name ?? "").trim().slice(0, 40);
  if (!name) return { ok: false, code: "name_required" };
  const id = String(input.id ?? "");
  const photoPath = String(input.photoPath ?? "");
  if (!CAT_ID_RE.test(id) || !ownPhotoPath(id, photoPath)) return { ok: false, code: "photo_invalid" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { data: files } = await user.sb.storage.from(PHOTO_BUCKET).list(id, { limit: 10 });
  if (!files?.some(f => `${id}/${f.name}` === photoPath)) return { ok: false, code: "photo_invalid" };
  // 正面、背部花紋照：路徑正確且真的已上傳才記錄；其他略過，不擋建立
  const extraPhotos: Partial<Record<ExtraView, string>> = {};
  for (const view of EXTRA_VIEWS) {
    const p = input.extraPaths?.[view];
    if (typeof p === "string" && ownExtraPhotoPath(id, view, p) && files.some(f => `${id}/${f.name}` === p)) extraPhotos[view] = p;
  }
  const { error } = await user.sb.from("meow_cat_models").insert({
    id, name, owner_type: "template", status: "draft", photo_path: photoPath, created_by: user.userId,
    profile: {
      gender: input.gender === "male" || input.gender === "female" ? input.gender : null,
      age_months: profileNumber(input.ageMonths), weight_kg: profileNumber(input.weightKg),
      notes: String(input.notes ?? "").trim().slice(0, 500),
      ...(Object.keys(extraPhotos).length ? { extra_photos: extraPhotos } : {}),
    },
  });
  if (error) return { ok: false, code: error.code === "23505" ? "busy" : "permission_denied" };
  return { ok: true, id };
}

/** 稽核日誌（meow_hq_log）；寫不進去不擋主要操作，但留下伺服器紀錄 */
async function audit(sb: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>, action: string, id: string, reason: string, detail?: object) {
  const { error } = await sb.rpc("meow_hq_log", { p_action: action, p_target_type: "cat_model", p_target_id: id, p_reason: reason, p_detail: detail ?? null });
  if (error) console.warn(`[cat-models] 稽核日誌寫入失敗（${action} ${id}）：${error.message}`);
}

/** 送出生成任務：新增一筆 queued 的任務，等本機 paint_worker.py --supabase 領取 */
export async function sbQueuePaint(id: string, view: unknown, fill: unknown, body?: unknown): Promise<
  { ok: true } | { ok: false; code: "not_found" | "invalid_option" | "busy" | "permission_denied" | "views_required" | "migration_required" }
> {
  const v = (["front", "left", "right"] as const).find(x => x === view);
  const f = (["none", "tabby"] as const).find(x => x === fill);
  if (!v || !f) return { ok: false, code: "invalid_option" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const cat = await sbGetCat(id);
  if (!cat) return { ok: false, code: "not_found" };
  if (body !== undefined && body !== "adult" && body !== "kitten") return { ok: false, code: "invalid_option" };
  const selectedBody: BodyType = body === "adult" || body === "kitten" ? body : cat.body;
  if (!cat.variantStorage && selectedBody !== cat.body) return { ok: false, code: "migration_required" };
  if (isJobActive(cat.status)) return { ok: false, code: "busy" };
  if (!viewsReady(cat)) return { ok: false, code: "views_required" };
  let removePending: string | null = null;
  // 有 AI 左側面照（#110）：用它上色、角度固定 left。worker 讀 photo_path 並快取去背圖，
  // 所以把 photo_path 換成 AI 照片、原始照片另存、清掉舊的去背快取（不用改 paint_worker.py）
  if (cat.variantStorage) {
    const existing = await getVariant(user.sb, id, selectedBody);
    if (existing) {
      const prepared = prepareVariant(fromVariantRow(existing));
      if (prepared.remove) {
        const { error } = await user.sb.from("meow_cat_model_variants").update(toVariantRow(prepared.variant))
          .eq("model_id", id).eq("body_type", selectedBody);
        if (error) return { ok: false, code: "permission_denied" };
        removePending = prepared.remove;
      }
    }
  } else await keepConfirmedTexture(user.sb, id);
  const useAi = await applyAiLeftPhoto(user.sb, id);
  const viewUsed = useAi ? "left" : v;
  const job = { model_id: id, status: "queued", step: "排隊中（請確認 paint_worker.py --supabase 有在執行）", view: viewUsed, fill: f };
  const { error } = cat.variantStorage
    ? await user.sb.from("meow_cat_model_jobs").insert({ ...job, body_type: selectedBody })
    : await user.sb.from("meow_cat_model_jobs").insert(job);
  // 同一隻貓同時只能有一筆 queued／running（資料庫 unique index）
  if (error) return { ok: false, code: error.code === "23505" ? "busy" : "permission_denied" };
  if (removePending) await user.sb.storage.from(MODEL_BUCKET).remove([removePending]);
  await user.sb.from("meow_cat_models").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", id);
  await audit(user.sb, "generate_model", id, "產生紋理貼圖", { view: viewUsed, fill: f, body: selectedBody, ai_photo: useAi });
  return { ok: true };
}

type Sb = NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>;

function fromVariantRow(row: VariantRow): Variant {
  return { albedo: row.albedo_path, prev: row.prev_albedo_path, baseVersion: row.base_version,
    prevBaseVersion: row.prev_base_version, confirmed: row.confirmed_albedo };
}

function toVariantRow(variant: Variant) {
  return { albedo_path: variant.albedo, prev_albedo_path: variant.prev, base_version: variant.baseVersion,
    prev_base_version: variant.prevBaseVersion, confirmed_albedo: variant.confirmed, updated_at: new Date().toISOString() };
}

async function getVariant(sb: Sb, id: string, body: BodyType): Promise<VariantRow | null> {
  const { data } = await sb.from("meow_cat_model_variants")
    .select("body_type,albedo_path,prev_albedo_path,base_version,prev_base_version,confirmed_albedo")
    .eq("model_id", id).eq("body_type", body).maybeSingle();
  return data as VariantRow | null;
}

/**
 * 送出重新產生前（#129）：記下目前已確認的貼圖（舊資料第一次記），
 * 目前版還沒確認時先丟掉，讓 worker 輪替後已確認的版本留在「上一版」，貓咪頁不會失去貼圖。
 */
async function keepConfirmedTexture(sb: Sb, id: string): Promise<void> {
  const { data } = await sb.from("meow_cat_models").select("albedo_path,prev_albedo_path,base_version,meta,profile").eq("id", id).maybeSingle();
  const row = data as Pick<Row, "albedo_path" | "prev_albedo_path" | "base_version" | "meta" | "profile"> | null;
  if (!row) return;
  const profile = row.profile ?? {};
  if (!("confirmed_albedo" in profile)) {
    await sb.from("meow_cat_models").update({ profile: { ...profile, confirmed_albedo: row.albedo_path } }).eq("id", id);
    return;
  }
  const plan = discardPending({
    albedo: row.albedo_path, prev: row.prev_albedo_path, confirmed: profile.confirmed_albedo,
    baseVersion: row.base_version, prevBaseVersion: row.meta?.prev_base_version,
  });
  if (!plan) return;
  const meta = { ...(row.meta ?? {}), prev_base_version: null };
  const { error } = await sb.from("meow_cat_models").update({ albedo_path: plan.albedo, prev_albedo_path: null, base_version: plan.baseVersion, meta }).eq("id", id);
  if (!error) await sb.storage.from(MODEL_BUCKET).remove([plan.remove]);
}

/** 確認使用目前的貼圖（#129）：確認後才能進第 4 步，貓咪頁改用這張 */
export async function sbConfirmTexture(id: string, body?: unknown): Promise<
  { ok: true } | { ok: false; code: "not_found" | "busy" | "no_texture" | "permission_denied" }
> {
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { data } = await user.sb.from("meow_cat_models").select("status,albedo_path,profile").eq("id", id).maybeSingle();
  if (!data) return { ok: false, code: "not_found" };
  const row = data as Pick<Row, "status" | "albedo_path" | "profile">;
  if (isJobActive(row.status)) return { ok: false, code: "busy" };
  if (body !== undefined && body !== "adult" && body !== "kitten") return { ok: false, code: "permission_denied" };
  if (body === "adult" || body === "kitten") {
    const existing = await getVariant(user.sb, id, body);
    if (!existing?.albedo_path) return { ok: false, code: "no_texture" };
    const { error } = await user.sb.from("meow_cat_model_variants")
      .update(toVariantRow(confirmVariant(fromVariantRow(existing)))).eq("model_id", id).eq("body_type", body);
    if (error) return { ok: false, code: "permission_denied" };
    await audit(user.sb, "confirm_texture", id, "確認使用紋理貼圖", { body });
    return { ok: true };
  }
  if (!row.albedo_path) return { ok: false, code: "no_texture" };
  const { error } = await user.sb.from("meow_cat_models").update({
    profile: { ...row.profile, confirmed_albedo: row.albedo_path }, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, code: "permission_denied" };
  await audit(user.sb, "confirm_texture", id, "確認使用紋理貼圖");
  return { ok: true };
}

/** 有 AI 左側面照時，讓 worker 用它上色；回傳是否改用 */
async function applyAiLeftPhoto(sb: Sb, id: string): Promise<boolean> {
  const { data } = await sb.from("meow_cat_models").select("photo_path,profile").eq("id", id).maybeSingle();
  const row = data as Pick<Row, "photo_path" | "profile"> | null;
  const left = row?.profile?.generated?.views?.left;
  if (!row || !left) return false;
  const profile = { ...row.profile, original_photo: row.profile.original_photo ?? row.photo_path };
  await sb.from("meow_cat_models").update({ photo_path: left, profile }).eq("id", id);
  // AI 照片可能重新產生過，去背快取一律重做
  await sb.storage.from(PHOTO_BUCKET).remove([`${id}/photo_nobg.png`]);
  return true;
}

export type StartViewsResult =
  | { ok: true; run: () => Promise<void> }
  | { ok: false; code: "ai_disabled" | "invalid_option" | "not_found" | "busy" | "permission_denied" };

/**
 * AI 三視角（#110）第一步：標記產生中，回傳 run（呼叫端放進 after() 背景執行）。
 * makeEdit 可注入假的影像生成（測試用）；預設用 Azure（imageConfig）。
 */
export async function sbStartViews(id: string, views: unknown = GEN_VIEWS, opts: StartViewsOptions = {}): Promise<StartViewsResult> {
  const list = Array.isArray(views) && views.length ? views : null;
  if (!list || !list.every(isGenView)) return { ok: false, code: "invalid_option" };
  const settings = viewSettings(opts);
  const cfg = imageConfig();
  const makeEdit = opts.makeEdit ?? (cfg ? () => azureEdit({ ...cfg, ...(settings.quality ? { quality: settings.quality } : {}) }, settings.size) : null);
  if (!makeEdit) return { ok: false, code: "ai_disabled" };
  if (!CAT_ID_RE.test(id)) return { ok: false, code: "not_found" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { data } = await user.sb.from("meow_cat_models").select("photo_path,profile").eq("id", id).maybeSingle();
  const row = data as Pick<Row, "photo_path" | "profile"> | null;
  if (!row) return { ok: false, code: "not_found" };
  if (generatedState(row.profile?.generated, (opts.now ?? new Date()).getTime()).aiRunning.length) return { ok: false, code: "busy" };
  const start = startGenerated(row.profile?.generated, list as GenView[], opts.now, settings);
  const { error } = await user.sb.from("meow_cat_models").update({ profile: { ...row.profile, generated: start } }).eq("id", id);
  if (error) return { ok: false, code: "permission_denied" };

  const run = async () => {
    // 參考照片：原始照片＋已上傳的正面／背部花紋照（#105、#107）
    const paths = [row.profile?.original_photo ?? row.photo_path, ...EXTRA_VIEWS.map(v => row.profile?.extra_photos?.[v]).filter((p): p is string => Boolean(p))];
    const refs = [];
    for (const p of paths) {
      const { data: blob } = await user.sb.storage.from(PHOTO_BUCKET).download(p);
      if (blob) refs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || "image/jpeg" });
      else if (p === paths[0]) break; // 原始照片讀不到就不產生
    }
    const outcome = refs.length && paths[0]
      ? await generateViews(list as GenView[], {
        refs, edit: makeEdit(), analyze: opts.analyze ?? analyzeAge, formAgeMonths: row.profile?.age_months ?? null,
        save: async (view, png) => {
          const path = `${id}/${genPhotoName(view)}`;
          const { error: e } = await user.sb.storage.from(PHOTO_BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
          if (e) throw new ImageGenError("AI 照片存檔失敗");
          return path;
        },
      })
      : { results: failAll(list as GenView[], "讀不到原始照片"), age: undefined, prompts: {} };
    // 重新讀一次 profile，避免蓋掉這段時間其他人的修改（例如補傳正面照）
    const { data: fresh } = await user.sb.from("meow_cat_models").select("profile").eq("id", id).maybeSingle();
    const profile = ((fresh as Pick<Row, "profile"> | null)?.profile ?? row.profile) as Row["profile"];
    await user.sb.from("meow_cat_models").update({
      profile: { ...profile, generated: finishGenerated(profile.generated, outcome.results, { age: outcome.age, prompts: outcome.prompts }) },
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  };
  return { ok: true, run };
}

/** 改用上一版：目前版與上一版互換（再按一次就換回來）；原因必填並寫稽核 */
export async function sbRestore(id: string, reason: string, body?: unknown): Promise<
  { ok: true } | { ok: false; code: "not_found" | "reason_required" | "busy" | "no_previous" | "permission_denied" }
> {
  const text = reason.trim();
  if (!text) return { ok: false, code: "reason_required" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { data } = await user.sb.from("meow_cat_models").select("status,albedo_path,prev_albedo_path,base_version,meta,profile").eq("id", id).maybeSingle();
  if (!data) return { ok: false, code: "not_found" };
  const row = data as Pick<Row, "status" | "albedo_path" | "prev_albedo_path" | "base_version" | "meta" | "profile">;
  if (isJobActive(row.status)) return { ok: false, code: "busy" };
  if (body !== undefined && body !== "adult" && body !== "kitten") return { ok: false, code: "permission_denied" };
  if (body === "adult" || body === "kitten") {
    const existing = await getVariant(user.sb, id, body);
    if (!existing?.prev_albedo_path) return { ok: false, code: "no_previous" };
    const { error } = await user.sb.from("meow_cat_model_variants")
      .update(toVariantRow(restoreVariant(fromVariantRow(existing)))).eq("model_id", id).eq("body_type", body);
    if (error) return { ok: false, code: "permission_denied" };
    await audit(user.sb, "restore_texture", id, text, { body });
    return { ok: true };
  }
  if (!row.prev_albedo_path) return { ok: false, code: "no_previous" };
  // 母體跟著貼圖換：worker 輪替時把上一版的母體記在 meta.prev_base_version（沒記錄＝成貓舊資料）
  const meta = row.meta ?? {};
  const { error } = await user.sb.from("meow_cat_models").update({
    albedo_path: row.prev_albedo_path, prev_albedo_path: row.albedo_path,
    base_version: meta.prev_base_version ?? null, meta: { ...meta, prev_base_version: row.base_version },
    // #129：改用上一版等於選了這個版本，也算確認
    profile: { ...(row.profile ?? {}), confirmed_albedo: row.prev_albedo_path },
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, code: "permission_denied" };
  await audit(user.sb, "restore_texture", id, text);
  return { ok: true };
}


/** 刪除貓咪模型：資料列（任務、體型變體跟著 cascade）＋照片與貼圖檔；排隊或生成中不能刪 */
export async function sbDeleteCat(id: string): Promise<
  { ok: true } | { ok: false; code: "not_found" | "busy" | "permission_denied" }
> {
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { data: row } = await user.sb.from("meow_cat_models").select("name,status,albedo_path,prev_albedo_path,profile").eq("id", id).maybeSingle();
  if (!row) return { ok: false, code: "not_found" };
  const running = generatedState(row.profile?.generated).aiRunning.length > 0;
  if (isJobActive(normalizeStatus(row.status as CatModelStatus)) || running) return { ok: false, code: "busy" };
  const { data: variants } = await user.sb.from("meow_cat_model_variants").select("albedo_path,prev_albedo_path").eq("model_id", id);
  const textures = [row, ...(variants ?? [])].flatMap(v => [v.albedo_path, v.prev_albedo_path]).filter((p): p is string => Boolean(p));

  const { error } = await user.sb.from("meow_cat_models").delete().eq("id", id);
  if (error) return { ok: false, code: "permission_denied" };
  // 檔案刪不掉不擋刪除（資料列已不在，畫面不會再顯示），只留伺服器紀錄
  const { data: photos } = await user.sb.storage.from(PHOTO_BUCKET).list(id, { limit: 100 });
  const photoPaths = (photos ?? []).map(f => `${id}/${f.name}`);
  for (const [bucket, paths] of [[PHOTO_BUCKET, photoPaths], [MODEL_BUCKET, textures]] as const) {
    if (!paths.length) continue;
    const { error: e } = await user.sb.storage.from(bucket).remove([...paths]);
    if (e) console.warn(`[cat-models] 刪除 ${id} 的檔案失敗（${bucket}）：${e.message}`);
  }
  await audit(user.sb, "cat_model_delete", id, "刪除貓咪模型", { name: row.name });
  return { ok: true };
}
