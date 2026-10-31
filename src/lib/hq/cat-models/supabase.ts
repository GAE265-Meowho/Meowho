// 貓咪模型｜Supabase 實作（規格書 04 §3；PR 3）
import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { canPublish, type CatModelStatus, type CatModelView, type FillPattern, type PhotoView, type PublishAction } from "./types";
import type { FileKind } from "./local";

export const PHOTO_BUCKET = "meow-cat-model-photos";
export const MODEL_BUCKET = "meow-cat-models";
export const BASE_PATH = "base/v1/base_clips.glb";

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
  created_at: string;
  updated_at: string;
};

export function publicObjectUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`;
}

function viewFromRow(row: Row): CatModelView {
  return {
    id: row.id,
    name: row.name,
    ownerType: row.owner_type,
    status: row.status,
    ageMonths: typeof row.profile?.age_months === "number" ? row.profile.age_months : null,
    weightKg: typeof row.profile?.weight_kg === "number" ? row.profile.weight_kg : null,
    notes: row.profile?.notes ?? "",
    photoView: row.photo_view,
    fillPattern: row.fill_pattern,
    hasAlbedo: Boolean(row.albedo_path),
    hasPrevAlbedo: Boolean(row.prev_albedo_path),
    albedoVersion: row.updated_at,
    jobStatus: null,
    jobQueuedAt: null,
    jobStartedAt: null,
    jobSeconds: null,
    jobStep: null,
    jobError: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function client() {
  return (await getServerSupabase()) ?? getAdminSupabase();
}

export async function sbListCats(): Promise<CatModelView[]> {
  const sb = await client();
  if (!sb) return [];
  const { data, error } = await sb.from("meow_cat_models").select("*").order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map(viewFromRow);
}

export async function sbGetCat(id: string): Promise<CatModelView | null> {
  const sb = await client();
  if (!sb) return null;
  const { data, error } = await sb.from("meow_cat_models").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return viewFromRow(data as Row);
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
export async function sbBaseRedirect(): Promise<string | null> {
  const sb = getAdminSupabase() ?? (await getServerSupabase());
  if (!sb) return null;
  const { data, error } = await sb.storage.from(MODEL_BUCKET).list("base/v1", { search: "base_clips.glb", limit: 1 });
  if (error || !data?.some(f => f.name === "base_clips.glb")) return null;
  return publicObjectUrl(MODEL_BUCKET, BASE_PATH);
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
