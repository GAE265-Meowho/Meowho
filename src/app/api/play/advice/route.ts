import { NextResponse } from "next/server";
import { isAIConfigured, writePlayAdvice } from "@/lib/ai/server";
import { handleAdvice } from "@/lib/play/handlers";

// 虛擬飼養 DEMO（#237）試養報告的建議（金額由前端公式算，不送也不收數字）。
// 不需要登入、不讀寫資料庫；固定用 Azure 聊天部署，沒設定或失敗時回規則備案（source: "rule"），流程不會卡住。
export const maxDuration = 30;

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const out = await handleAdvice(raw, { configured: isAIConfigured("azure"), run: writePlayAdvice });
  return NextResponse.json(out.body, { status: out.status });
}
