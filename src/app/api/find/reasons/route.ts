import { NextResponse } from "next/server";
import { checkInput } from "@/lib/ai/guard";
import { findReasons } from "@/lib/ai/server";
import { FIND_SELECT, catText, type FindCatRow } from "@/lib/find-cats";
import { getServerSupabase } from "@/lib/supabase/server";

// 幫我找貓（規格 11）：結果出來後，畫面再呼叫這裡為前幾名換上 AI 寫的「為什麼推薦」。
// need 是 /api/find 回傳的需求文字（包含使用者的話，一律經 wrapUserInput 包成資料）；貓用登入者身分重新讀（RLS），只讀得到待領養、公開的。
// AI 沒設定或失敗回傳空陣列，畫面保留規則組的句子。
const TOP = 6;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { need?: unknown; ids?: unknown } | null;
  const need = checkInput(body?.need, 600);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, TOP) : [];
  if (!need.ok || !ids.length) return NextResponse.json({ reasons: [] });
  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ reasons: [] });
  const { data } = await sb.from("meow_cats").select(FIND_SELECT).eq("status", "adoptable").in("id", ids);
  const rows = ((data ?? []) as unknown as FindCatRow[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const reasons = rows.length ? await findReasons(need.text, rows.map(row => ({ row, text: catText(row) }))) : null;
  return NextResponse.json({ reasons: (reasons ?? []).filter(r => ids.includes(r.id)) });
}
