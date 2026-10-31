import { NextResponse } from "next/server";
import { extractIntakeTurn } from "@/lib/ai/server";
import { AI_LIMITS, checkInput } from "@/lib/ai/guard";
import { requireUserForApi } from "@/lib/supabase/server";
import { nextStep, takeTurn } from "@/lib/onboarding/conversation";
import { IntakeStateSchema } from "@/lib/onboarding/intake-rows";

// 建檔對話的一句話（#72）：草稿＋這句話 → 更新後草稿與下一步。草稿只是暫存，真正寫入時資料庫會再檢查。
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { state?: unknown; text?: unknown } | null;
  const parsed = IntakeStateSchema.safeParse(body?.state);
  if (!parsed.success) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  const input = checkInput(body?.text, parsed.data.phase === "cat" ? AI_LIMITS.catStoryChars : AI_LIMITS.onboardingChars);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const r = await takeTurn(parsed.data, input.text, extractIntakeTurn);
  return NextResponse.json({ state: r.state, reply: r.reply, step: nextStep(r.state), ai: r.usedAI });
}
