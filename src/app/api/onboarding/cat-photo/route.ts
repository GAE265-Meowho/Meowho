import { NextResponse } from "next/server";
import { analyzeCatPhoto } from "@/lib/ai/server";
import { requireUserForApi } from "@/lib/supabase/server";

// 照片判讀（#72）：是否為貓、毛色花紋、品種、估計月齡、信心值。不猜性別。
// 照片本身由瀏覽器先存進 Supabase Storage，這裡只看縮小後的圖。
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { mime?: string; base64?: string } | null;
  if (!body?.base64 || !body.mime?.startsWith("image/")) return NextResponse.json({ error: "請上傳圖片" }, { status: 400 });
  if (body.base64.length > 2_000_000) return NextResponse.json({ error: "圖片太大，請重新選擇" }, { status: 413 });
  const result = await analyzeCatPhoto(body.mime, body.base64);
  return NextResponse.json({ result, ai: Boolean(result) });
}
