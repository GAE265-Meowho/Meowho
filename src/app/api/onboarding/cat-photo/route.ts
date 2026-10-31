import { NextResponse } from "next/server";
import { analyzeCatPhoto } from "@/lib/ai/server";
import { requireUserForApi } from "@/lib/supabase/server";

// 照片判讀（#72）：是否為貓、毛色花紋、品種、估計月齡、信心值。不猜性別。
// 也判斷是否違反善良風俗、和封面是不是同一隻。瀏覽器等判讀通過才把照片存進 Supabase Storage。
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { mime?: string; base64?: string; reference?: string } | null;
  if (!body?.base64 || !body.mime?.startsWith("image/")) return NextResponse.json({ error: "請上傳圖片" }, { status: 400 });
  if (body.base64.length > 2_000_000) return NextResponse.json({ error: "圖片太大，請重新選擇" }, { status: 413 });
  const reference = typeof body.reference === "string" && body.reference.length <= 2_000_000 ? body.reference : undefined;
  const result = await analyzeCatPhoto(body.mime, body.base64, reference);
  return NextResponse.json({ result, ai: Boolean(result) });
}
