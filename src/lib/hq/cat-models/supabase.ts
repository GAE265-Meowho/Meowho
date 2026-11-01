// 貓咪模型｜Supabase 實作（規格書 04 §3；PR 3、#88）
// 讀取用登入者（失敗退回 service role）；寫入一律用登入者的 session，讓 RLS 的 virtual_assets 權限把關。
// 照片由瀏覽器直傳 Storage（伺服器只簽上傳網址），避開 Vercel 約 4.5 MB 的請求大小上限。
// 產生貼圖由本機 paint_worker.py --supabase 領取 meow_cat_model_jobs，完成後寫回 albedo_path／base_version。
import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import {
  baseFileName, bodyFor, canPublish, isJobActive, newCatId, ownPhotoPath, photoExt, profileNumber,
  type BodyType, type CatModelStatus, type CatModelView, type FillPattern, type JobStatus, type PhotoView, type PublishAction,
  CAT_ID_RE, MAX_PHOTO_BYTES,
} from "./types";
import type { FileKind } from "./local";

export const PHOTO_BUCKET = "meow-cat-model-photos";
export const MODEL_BUCKET = "meow-cat-models";
export const BASE_DIR = "base/v1";

type Row = {
  id: string;
  name: string;
  owner_type: "template" | "member";
  status: CatModelStatus;
  profile: { age_months?: number | null; weight_kg?: number | null; notes?: string };
  photo_path: string;
  photo_view: PhotoView | null;
  fill_pattern: FillPattern | null;
  albedo_path: string | null;
  prev_albedo_path: string | null;
  base_version: string | null;
  meta: { seconds?: number; prev_base_version?: string | null } | null;
  created_at: string;
  updated_at: string;
};

type JobRow = {
  status: JobStatus;
  step: string | null;
  error: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
};

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
    status: row.status,
    ageMonths,
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

export async function sbListCats(): Promise<CatModelView[]> {
  const sb = await client();
  if (!sb) return [];
  const { data, error } = await sb.from("meow_cat_models").select("*").order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map(r => viewFromRow(r));
}

export async function sbGetCat(id: string): Promise<CatModelView | null> {
  const sb = await client();
  if (!sb) return null;
  const { data, error } = await sb.from("meow_cat_models").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  // 貼圖工作頁每 3 秒輪詢：帶上最新一筆任務的狀態與步驟
  const { data: job } = await sb.from("meow_cat_model_jobs")
    .select("status,step,error,queued_at,started_at,finished_at")
    .eq("model_id", id).order("queued_at", { ascending: false }).limit(1).maybeSingle();
  return viewFromRow(data as Row, (job as JobRow | null) ?? null);
}

export async function sbFileRedirect(id: string, kind: FileKind): Promise<string | null> {
  const sb = await client();
  if (!sb) return null;
  const { data } = await sb.from("meow_cat_models").select("photo_path,albedo_path,prev_albedo_path").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as Pick<Row, "photo_path" | "albedo_path" | "prev_albedo_path">;
  if (kind === "photo") {
    // 私有 bucket：先用登入者簽、失敗再用 service role
    const trySign = async (c: NonNullable<Awaited<ReturnType<typeof client>>>) => {
      const { data: signed } = await c.storage.from(PHOTO_BUCKET).createSignedUrl(row.photo_path, 3600);
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
export async function sbPhotoUpload(type: unknown, size: unknown, now = new Date()): Promise<
  UploadTicket | { ok: false; code: "photo_invalid" | "photo_too_large" | "permission_denied" }
> {
  const ext = photoExt(type);
  if (!ext || typeof size !== "number" || size <= 0) return { ok: false, code: "photo_invalid" };
  if (size > MAX_PHOTO_BYTES) return { ok: false, code: "photo_too_large" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const id = newCatId(now);
  const path = `${id}/photo.${ext}`;
  const { data, error } = await user.sb.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, code: "permission_denied" };
  return { ok: true, id, bucket: PHOTO_BUCKET, path, token: data.token };
}

export type SbCreateInput = { id?: unknown; photoPath?: unknown; name: unknown; ageMonths?: unknown; weightKg?: unknown; notes?: unknown };

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
  const { error } = await user.sb.from("meow_cat_models").insert({
    id, name, owner_type: "template", status: "draft", photo_path: photoPath, created_by: user.userId,
    profile: {
      age_months: profileNumber(input.ageMonths), weight_kg: profileNumber(input.weightKg),
      notes: String(input.notes ?? "").trim().slice(0, 500),
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
export async function sbQueuePaint(id: string, view: unknown, fill: unknown): Promise<
  { ok: true } | { ok: false; code: "not_found" | "invalid_option" | "busy" | "permission_denied" }
> {
  const v = (["front", "left", "right"] as const).find(x => x === view);
  const f = (["none", "tabby"] as const).find(x => x === fill);
  if (!v || !f) return { ok: false, code: "invalid_option" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const cat = await sbGetCat(id);
  if (!cat) return { ok: false, code: "not_found" };
  if (isJobActive(cat.status)) return { ok: false, code: "busy" };
  const { error } = await user.sb.from("meow_cat_model_jobs").insert({
    model_id: id, status: "queued", step: "排隊中（請確認 paint_worker.py --supabase 有在執行）", view: v, fill: f,
  });
  // 同一隻貓同時只能有一筆 queued／running（資料庫 unique index）
  if (error) return { ok: false, code: error.code === "23505" ? "busy" : "permission_denied" };
  await user.sb.from("meow_cat_models").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", id);
  await audit(user.sb, "generate_model", id, "產生貼圖", { view: v, fill: f, body: cat.body });
  return { ok: true };
}

/** 改用上一版：目前版與上一版互換（再按一次就換回來）；原因必填並寫稽核 */
export async function sbRestore(id: string, reason: string): Promise<
  { ok: true } | { ok: false; code: "not_found" | "reason_required" | "busy" | "no_previous" | "permission_denied" }
> {
  const text = reason.trim();
  if (!text) return { ok: false, code: "reason_required" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { data } = await user.sb.from("meow_cat_models").select("status,albedo_path,prev_albedo_path,base_version,meta").eq("id", id).maybeSingle();
  if (!data) return { ok: false, code: "not_found" };
  const row = data as Pick<Row, "status" | "albedo_path" | "prev_albedo_path" | "base_version" | "meta">;
  if (isJobActive(row.status)) return { ok: false, code: "busy" };
  if (!row.prev_albedo_path) return { ok: false, code: "no_previous" };
  // 母體跟著貼圖換：worker 輪替時把上一版的母體記在 meta.prev_base_version（沒記錄＝成貓舊資料）
  const meta = row.meta ?? {};
  const { error } = await user.sb.from("meow_cat_models").update({
    albedo_path: row.prev_albedo_path, prev_albedo_path: row.albedo_path,
    base_version: meta.prev_base_version ?? null, meta: { ...meta, prev_base_version: row.base_version },
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, code: "permission_denied" };
  await audit(user.sb, "restore_texture", id, text);
  return { ok: true };
}

export async function sbPublish(
  id: string,
  action: PublishAction,
  reason: string,
): Promise<{ ok: true; status: "published" | "unpublished" } | { ok: false; code: "not_found" | "reason_required" | "invalid_state" | "permission_denied" | "disabled" }> {
  const sb = await getServerSupabase();
  if (!sb) return { ok: false, code: "disabled" };
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { ok: false, code: "permission_denied" };
  const text = reason.trim();
  if (!text) return { ok: false, code: "reason_required" };
  const cat = await sbGetCat(id);
  if (!cat) return { ok: false, code: "not_found" };
  if (!canPublish(cat.status, action)) return { ok: false, code: "invalid_state" };
  const { data, error } = await sb.rpc("meow_publish_cat_model", { p_id: id, p_action: action, p_reason: text });
  if (error) {
    const msg = error.message || "";
    if (msg.includes("permission_denied")) return { ok: false, code: "permission_denied" };
    if (msg.includes("not_found")) return { ok: false, code: "not_found" };
    if (msg.includes("invalid_state")) return { ok: false, code: "invalid_state" };
    if (msg.includes("reason_required")) return { ok: false, code: "reason_required" };
    return { ok: false, code: "invalid_state" };
  }
  return { ok: true, status: data as "published" | "unpublished" };
}
