import { NextResponse } from "next/server";
import { isLLMConfigured, llmJson } from "@/lib/llm";
import { CAT_PHOTO } from "@/lib/prompts/onboarding";
import { requireUserForApi } from "@/lib/supabase/server";

export interface CatPhotoResult { isCat: boolean; breed: string | null; coat: string | null; ageBand: string | null; confidence: number; comment: string }

// 照片 → Vision 建議品種、毛色、年齡層（FR-03-01）。同時做基本內容檢查（FR-16-01）
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { mime?: string; base64?: string } | null;
  if (!body?.base64 || !body.mime?.startsWith("image/")) return NextResponse.json({ error: "請上傳圖片" }, { status: 400 });
  if (body.base64.length > 2_000_000) return NextResponse.json({ error: "圖片太大，請重新選擇" }, { status: 413 });
  if (!isLLMConfigured()) return NextResponse.json({ result: null, ai: false });
  try {
    const result = await llmJson<CatPhotoResult>({
      system: CAT_PHOTO.system, jsonShape: CAT_PHOTO.jsonShape,
      user: "請辨識這張照片中的貓咪外觀。", image: { mime: body.mime, base64: body.base64 },
    });
    return NextResponse.json({ result, ai: true });
  } catch {
    return NextResponse.json({ result: null, ai: false });
  }
}
