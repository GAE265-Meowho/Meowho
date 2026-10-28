import { NextResponse } from "next/server";
import { recognizeCatPhoto } from "@/lib/ai/server";
import { requireUserForApi } from "@/lib/supabase/server";

// 照片 → Vision 建議品種、毛色、年齡層（FR-03-01）。同時做基本內容檢查（FR-16-01）
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { mime?: string; base64?: string } | null;
  if (!body?.base64 || !body.mime?.startsWith("image/")) return NextResponse.json({ error: "請上傳圖片" }, { status: 400 });
  if (body.base64.length > 2_000_000) return NextResponse.json({ error: "圖片太大，請重新選擇" }, { status: 413 });
  const result = await recognizeCatPhoto(body.mime, body.base64);
  return NextResponse.json({ result, ai: Boolean(result) });
}
