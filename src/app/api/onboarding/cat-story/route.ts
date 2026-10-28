import { NextResponse } from "next/server";
import { organizeCatStory } from "@/lib/ai/server";
import { requireUserForApi } from "@/lib/supabase/server";
import { extractStoryByRules } from "@/lib/onboarding/cat";

// 自由口述 → 性格、癖好、補充（FR-03-03）
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { text?: string; name?: string } | null;
  if (!body?.text?.trim()) return NextResponse.json({ error: "請說說貓咪的個性" }, { status: 400 });
  const text = body.text.slice(0, 2000);
  const rules = extractStoryByRules(text);
  const r = await organizeCatStory(body.name, text);
  if (!r) return NextResponse.json({ story: rules, reply: null, ai: false });
  const traits = r.traits.filter(t => t.length <= 8).slice(0, 5);
  return NextResponse.json({
    story: { traits: traits.length ? traits : rules.traits, quirks: r.quirks ?? rules.quirks, notes: r.notes ?? rules.notes, neutered: r.neutered ?? rules.neutered },
    reply: r.reply, ai: true,
  });
}
