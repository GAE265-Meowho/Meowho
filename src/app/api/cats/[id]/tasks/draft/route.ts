import { NextResponse } from "next/server";
import { draftToContent } from "@/lib/adoption-tasks";
import { draftAdoptionTasks } from "@/lib/ai/server";
import { fallbackTaskDraft } from "@/lib/ai/tasks";
import { getServerSupabase } from "@/lib/supabase/server";

// 領養任務草稿（規格 09 §5.2）：中途按「AI 幫我生成」時呼叫。用登入者的身分讀資料（RLS），只有這隻貓的中途拿得到。
// 送給 AI 的是貓的個性、健康、習慣、描述、故事與影片觀察（照片和影片本身不送）；AI 沒設定或失敗時回傳固定草稿。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ error: "還沒連接資料庫" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  // meow_cat_publish_check 只回給這隻貓的中途
  const { data: check } = await sb.rpc("meow_cat_publish_check", { p_cat_id: id });
  if (!check) return NextResponse.json({ error: "找不到這隻貓" }, { status: 404 });

  const [{ data: cat }, { data: videos }] = await Promise.all([
    sb.from("meow_cats").select("name, life_stage, personality_tags, health_tags, habits, description, timeline").eq("id", id).maybeSingle(),
    sb.from("meow_cat_videos").select("ai_reason").eq("cat_id", id),
  ]);
  if (!cat) return NextResponse.json({ error: "找不到這隻貓" }, { status: 404 });

  const out = await draftAdoptionTasks({
    name: cat.name, lifeStage: cat.life_stage, personality: cat.personality_tags ?? [], health: cat.health_tags ?? [], habits: cat.habits ?? [],
    description: cat.description, timeline: ((cat.timeline ?? []) as { date: string; event: string }[]).map(e => `${e.date} ${e.event}`),
    videoNotes: (videos ?? []).map(v => v.ai_reason).filter((x): x is string => Boolean(x)),
  });
  return NextResponse.json({ content: draftToContent(out ?? fallbackTaskDraft(cat.name, cat.life_stage)), ai: Boolean(out) });
}
