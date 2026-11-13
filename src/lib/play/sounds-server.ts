// 虛擬飼養音檔的伺服器端（#393）：列出 Storage 裡已有的音檔、MeowHQ 上傳音效。
// 上傳只給有 virtual_assets 模組權限的人（meow_has_module）；確認後才用 service role 寫進公開 bucket，前台拿不到寫入權限。
import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { AUDIO_BUCKET, type SoundId, type SoundIndex } from "./audio";
import { checkSoundUpload, isSoundId, licenseText, uploadPaths, type SoundUploadProblem } from "./sound-upload";

/** 已上傳的音檔：ID → 版本（最後更新時間，接在網址後面，換檔後瀏覽器不會播到舊的） */
export async function listSoundFiles(): Promise<SoundIndex | null> {
  const admin = getAdminSupabase();
  if (!admin) return null;
  const out: SoundIndex = {};
  for (const folder of ["bgm", "sfx"]) {
    const { data, error } = await admin.storage.from(AUDIO_BUCKET).list(folder, { limit: 200 });
    if (error) return null;
    for (const f of data ?? []) {
      const id = f.name.replace(/\.mp3$/, "");
      if (f.name.endsWith(".mp3") && isSoundId(id)) out[id] = String(Date.parse(f.updated_at ?? f.created_at ?? "") || 0);
    }
  }
  return out;
}

export type UploadResult = { ok: true; id: SoundId; path: string; version: string } | { ok: false; code: SoundUploadProblem | "permission_denied" | "upload_failed" };

const field = (form: FormData, k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };

export async function uploadSound(form: FormData): Promise<UploadResult> {
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return { ok: false, code: "permission_denied" };
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { ok: false, code: "permission_denied" };
  const { data: allowed, error: permError } = await sb.rpc("meow_has_module", { p_module: "virtual_assets" });
  if (permError || !allowed) return { ok: false, code: "permission_denied" };

  const file = form.get("file");
  if (!(file instanceof Blob)) return { ok: false, code: "file_empty" };
  const input = {
    id: field(form, "id"), fileName: file instanceof File ? file.name : "", type: file.type, size: file.size,
    source: field(form, "source"), license: field(form, "license"), author: field(form, "author"), note: field(form, "note"),
  };
  const problem = checkSoundUpload(input);
  if (problem) return { ok: false, code: problem };
  const id = input.id as SoundId;

  const { data: profile } = await sb.from("meow_profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
  const by = (profile?.display_name as string | null)?.trim() || "MeowHQ 管理員";
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const paths = uploadPaths(id);

  const bucket = admin.storage.from(AUDIO_BUCKET);
  // 同一個網址會被瀏覽器快取，所以短一點；換檔後網址會帶新版本號
  const audio = await bucket.upload(paths.audio, Buffer.from(await file.arrayBuffer()), { contentType: "audio/mpeg", upsert: true, cacheControl: "3600" });
  if (audio.error) return { ok: false, code: "upload_failed" };
  const lic = await bucket.upload(paths.license, Buffer.from(licenseText(id, input, by, date), "utf8"), { contentType: "text/plain; charset=utf-8", upsert: true, cacheControl: "3600" });
  if (lic.error) return { ok: false, code: "upload_failed" };
  return { ok: true, id, path: paths.audio, version: String(Date.now()) };
}
