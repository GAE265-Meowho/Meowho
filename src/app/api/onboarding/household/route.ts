import { NextResponse } from "next/server";
import { extractHousehold } from "@/lib/ai/server";
import { requireUserForApi } from "@/lib/supabase/server";
import { HOUSEHOLD_STEPS, mergeHouseholdExtraction, type HouseholdDraft, type HouseholdStep } from "@/lib/onboarding/household";

// 解析建立貓戶聊天中「一題」的回答（FR-02-01、FR-03-02）
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { step?: HouseholdStep; answer?: string; draft?: HouseholdDraft } | null;
  if (!body?.step || !HOUSEHOLD_STEPS.includes(body.step) || typeof body.answer !== "string" || !body.draft) {
    return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  }
  const answer = body.answer.slice(0, 1000);
  const llm = await extractHousehold(body.step, answer);
  const draft = mergeHouseholdExtraction(body.draft, body.step, answer, llm);
  return NextResponse.json({ draft, reply: llm?.reply ?? null, ai: Boolean(llm) });
}
