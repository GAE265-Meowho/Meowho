import { NextResponse } from "next/server";
import { isLLMConfigured, llmJson } from "@/lib/llm";
import { CAT_STORY } from "@/lib/prompts/onboarding";
import { requireUserForApi } from "@/lib/supabase/server";
import { extractStoryByRules } from "@/lib/onboarding/cat";

interface StoryResult { traits: string[]; quirks: string | null; notes: string | null; neutered: boolean | null; reply?: string }

// 自由口述 → 性格、癖好、補充（FR-03-03）
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { text?: string; name?: string } | null;
  if (!body?.text?.trim()) return NextResponse.json({ error: "請說說貓咪的個性" }, { status: 400 });
  const text = body.text.slice(0, 2000);
  const rules = extractStoryByRules(text);
  if (isLLMConfigured()) {
    try {
      const r = await llmJson<StoryResult>({
        system: CAT_STORY.system, jsonShape: CAT_STORY.jsonShape,
        user: `貓咪名字：${body.name ?? "（未命名）"}\n描述：${text}`, temperature: 0.3,
      });
      const traits = Array.isArray(r.traits) ? r.traits.filter(t => typeof t === "string" && t.length <= 8).slice(0, 5) : rules.traits;
      return NextResponse.json({
        story: { traits, quirks: r.quirks ?? rules.quirks, notes: r.notes ?? rules.notes, neutered: typeof r.neutered === "boolean" ? r.neutered : rules.neutered },
        reply: r.reply ?? null, ai: true,
      });
    } catch { /* 改用規則 */ }
  }
  return NextResponse.json({ story: rules, reply: null, ai: false });
}
