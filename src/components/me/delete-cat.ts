"use client";
// 刪除一隻貓（#82）：先刪雲端的照片與影片，再刪資料庫紀錄（影片紀錄會跟著連動刪除）。
// 照片在 Supabase（喵戶長自己的資料夾）；影片在 Azure，經 API 刪除（伺服器會再檢查是不是自己的貓）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "@/lib/supabase/config";

export const ADOPTED_CAT = "從中途領養來的貓不能刪除，真的無法繼續照顧時，請在貓咪頁向原中途提出退養請求。";

const pathFromPublicUrl = (url: string | null) => url?.split(`/${PHOTO_BUCKET}/`)[1] ?? null;

export async function deleteCat(sb: SupabaseClient, catId: string): Promise<string | null> {
  const [{ data: cat, error }, { data: videos }] = await Promise.all([
    sb.from("meow_cats").select("photo_paths, photo_url, origin_household_id").eq("id", catId).single(),
    sb.from("meow_cat_videos").select("storage_path").eq("cat_id", catId),
  ]);
  if (error || !cat) return error?.message ?? "找不到這隻貓";
  // 資料庫也會擋（0009），但要在刪檔案之前先擋，不然照片會先不見
  if (cat.origin_household_id) return ADOPTED_CAT;
  const photos: string[] = cat.photo_paths?.length ? cat.photo_paths : [pathFromPublicUrl(cat.photo_url)].filter((p): p is string => Boolean(p));
  if (photos.length) await sb.storage.from(PHOTO_BUCKET).remove(photos);
  await Promise.all((videos ?? []).map(v => fetch("/api/onboarding/cat-video", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: v.storage_path }),
  }).catch(() => null)));
  const { error: delErr } = await sb.from("meow_cats").delete().eq("id", catId);
  return delErr?.message ?? null;
}

/** 刪除喵戶（#82）：先逐隻刪貓（含照片、影片），再刪喵戶；問卷、收藏、認證申請由資料庫連動刪除 */
export async function deleteHousehold(sb: SupabaseClient, householdId: string, catIds: string[]): Promise<string | null> {
  for (const id of catIds) {
    const err = await deleteCat(sb, id);
    if (err) return `刪除貓咪時失敗：${err}`;
  }
  const { error } = await sb.from("meow_households").delete().eq("id", householdId);
  return error?.message ?? null;
}
