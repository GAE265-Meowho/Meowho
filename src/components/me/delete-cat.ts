"use client";
// 刪除一隻貓（#82）：先刪雲端的照片與影片，再刪資料庫紀錄（影片紀錄會跟著連動刪除）。
// 照片在 Supabase（喵戶長自己的資料夾）；影片在 Azure，經 API 刪除（伺服器會再檢查是不是自己的貓）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "@/lib/supabase/config";

const pathFromPublicUrl = (url: string | null) => url?.split(`/${PHOTO_BUCKET}/`)[1] ?? null;

export async function deleteCat(sb: SupabaseClient, catId: string): Promise<string | null> {
  const [{ data: cat, error }, { data: videos }] = await Promise.all([
    sb.from("meow_cats").select("photo_paths, photo_url").eq("id", catId).single(),
    sb.from("meow_cat_videos").select("storage_path").eq("cat_id", catId),
  ]);
  if (error || !cat) return error?.message ?? "找不到這隻貓";
  const photos: string[] = cat.photo_paths?.length ? cat.photo_paths : [pathFromPublicUrl(cat.photo_url)].filter((p): p is string => Boolean(p));
  if (photos.length) await sb.storage.from(PHOTO_BUCKET).remove(photos);
  await Promise.all((videos ?? []).map(v => fetch("/api/onboarding/cat-video", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: v.storage_path }),
  }).catch(() => null)));
  const { error: delErr } = await sb.from("meow_cats").delete().eq("id", catId);
  return delErr?.message ?? null;
}
