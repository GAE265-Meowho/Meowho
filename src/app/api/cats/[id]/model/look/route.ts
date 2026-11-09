import { NextResponse } from "next/server";
import { confirmedLook } from "@/lib/cat-publish";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";

// 貓咪頁的 3D 貓：回這隻貓中途確認過的 3D 模型（母體網址＋貼圖）。
// 看不看得到這隻貓照 meow_cats 的 RLS（用請求者身分讀，沒登入也可以）；模型表只開放給登入者（0017），所以模型用 service role 讀，
// 只回已確認的貼圖，不回其他欄位。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return NextResponse.json({ look: null });
  const { data: cat } = await sb.from("meow_cats").select("id, life_stage").eq("id", id).maybeSingle();
  if (!cat) return NextResponse.json({ error: "cat_not_found" }, { status: 404 });
  const { data: m } = await admin.from("meow_cat_models").select("variants:meow_cat_model_variants(body_type, confirmed_albedo)").eq("cat_id", id).maybeSingle();
  const look = confirmedLook(m?.variants as { body_type: string; confirmed_albedo: string | null }[] | undefined, cat.life_stage, SUPABASE_URL);
  return NextResponse.json({ look }, { headers: { "Cache-Control": "private, max-age=60" } });
}
