import { NextResponse } from "next/server";
import { GEN_VIEWS, generatedState, type GeneratedProfile } from "@/lib/hq/cat-models/types";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

// 中途在前台預覽 AI 三視角（#188）：產生中、完成的圖（短時效網址）、失敗原因。
// 照片在私有 bucket meow-cat-model-photos，只給這隻貓的中途看（meow_cat_publish_check 只回給中途），用 service role 簽網址。
export const dynamic = "force-dynamic";
const PHOTO_BUCKET = "meow-cat-model-photos";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: check } = await sb.rpc("meow_cat_publish_check", { p_cat_id: id });
  if (!check) return NextResponse.json({ error: "cat_not_keeper" }, { status: 403 });

  const { data: model } = await admin.from("meow_cat_models").select("id, profile").eq("cat_id", id).maybeSingle();
  if (!model) return NextResponse.json({ started: false, running: [], views: {}, errors: {} });
  const g = (model.profile as { generated?: GeneratedProfile } | null)?.generated;
  const st = generatedState(g);
  const views: Record<string, string | null> = {};
  for (const v of GEN_VIEWS) {
    const path = g?.views?.[v];
    views[v] = path ? (await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, 600)).data?.signedUrl ?? null : null;
  }
  return NextResponse.json({ started: Boolean(g), running: st.aiRunning, views, errors: st.aiErrors });
}
