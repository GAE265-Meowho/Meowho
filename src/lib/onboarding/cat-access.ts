import "server-only";
// 影片上傳與判讀前的權限檢查：還沒建立的貓（新草稿）或自己喵戶的貓才可以。
// 影片列真正寫入時，meow_cat_videos 的 RLS 會再擋一次。
import { getServerSupabase } from "@/lib/supabase/server";

export async function canWriteCat(userId: string | null, catId: string): Promise<boolean> {
  const sb = await getServerSupabase();
  if (!sb || !userId) return true; // 示範模式
  const { data } = await sb.from("meow_cats").select("household:meow_households!inner(owner_id)").eq("id", catId).maybeSingle();
  if (!data) return true;
  const owner = (data.household as unknown as { owner_id: string } | null)?.owner_id;
  return owner === userId;
}
