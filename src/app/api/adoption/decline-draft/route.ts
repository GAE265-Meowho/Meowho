import { NextResponse } from "next/server";
import { answerText } from "@/components/adoption-form/answer-text";
import { fallbackDeclineReason, tidyDraft } from "@/lib/ai/decline";
import { draftDeclineReason } from "@/lib/ai/server";
import type { Answers, Question } from "@/lib/adoption-form/questionnaire";
import { getServerSupabase } from "@/lib/supabase/server";

// 婉拒理由草稿（#128）：中途按「婉拒」時呼叫。用登入者的身分讀資料（RLS），只有這串的喵戶長拿得到草稿。
// 送給 AI 的只有貓名、申請人名稱和問卷文字回答（照片不送）；AI 沒設定或失敗時回傳固定草稿。
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ error: "還沒連接資料庫" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { threadId?: unknown } | null;
  if (typeof body?.threadId !== "string") return NextResponse.json({ error: "參數錯誤" }, { status: 400 });

  const { data: t } = await sb.from("meow_threads").select("id, cat_id, member_id, cat_name, member_name, household_id").eq("id", body.threadId).maybeSingle();
  const { data: home } = t ? await sb.from("meow_households").select("owner_id").eq("id", t.household_id).maybeSingle() : { data: null };
  if (!t || home?.owner_id !== auth.user.id) return NextResponse.json({ error: "找不到這段對話" }, { status: 404 });

  let answers: { q: string; a: string }[] = [];
  const { data: form } = await sb.from("meow_adoption_forms").select("id, questions").eq("cat_id", t.cat_id).maybeSingle();
  if (form) {
    const { data: r } = await sb.from("meow_adoption_responses").select("answers").eq("form_id", form.id).eq("respondent_id", t.member_id)
      .neq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (r) {
      answers = (form.questions as Question[]).filter(q => q.type !== "note" && q.type !== "photo")
        .map(q => ({ q: q.text, a: answerText(q, (r.answers as Answers)[q.id]) }));
    }
  }

  const out = await draftDeclineReason({ catName: t.cat_name, memberName: t.member_name, answers });
  return NextResponse.json({ reason: out ? tidyDraft(out.reason, t.cat_name) : fallbackDeclineReason(t.cat_name), ai: Boolean(out) });
}
