import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMediaStore } from "@/lib/storage/server";

// 貓咪頁的影片（#70）：影片在私人的 Azure 容器，看得到這隻貓的人才拿得到短時效的讀取網址。
// 「看不看得到」交給 meow_cat_videos 的 RLS（跟貓的公開規則一樣）。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const store = getMediaStore();
  if (!sb || !store) return NextResponse.json({ videos: [] });
  const { data } = await sb.from("meow_cat_videos").select("storage_path").eq("cat_id", id).order("created_at");
  const videos = await Promise.all((data ?? []).map(async v => ({ path: v.storage_path as string, url: await store.readUrl(v.storage_path) })));
  return NextResponse.json({ videos });
}
