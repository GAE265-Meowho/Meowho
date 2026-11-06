import { NextResponse } from "next/server";
import { isAIConfigured, detectPlayHazards } from "@/lib/ai/server";
import { handleHazards } from "@/lib/play/handlers";

// 虛擬飼養 DEMO（#237）居家危險：輸入是房間物品清單（選填 3D 畫面截圖），輸出危險清單（項目、等級、建議）。
// 不需要登入、不讀寫資料庫；固定用 Azure 聊天部署，沒設定或失敗時回規則備案（source: "rule"），流程不會卡住。
export const maxDuration = 30;

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const out = await handleHazards(raw, { configured: isAIConfigured("azure"), run: detectPlayHazards });
  return NextResponse.json(out.body, { status: out.status });
}
