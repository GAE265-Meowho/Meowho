import { NextResponse } from "next/server";
import { isAIConfigured, writePlayLines } from "@/lib/ai/server";
import { handleLines } from "@/lib/play/handlers";

// 虛擬飼養 DEMO（#237）每個節點的個人化台詞：依玩家背景與房間家具加寫一段（約 8 秒逾時）。
// 不需要登入、不讀寫資料庫；固定用 Azure 聊天部署，沒設定或失敗時回規則備案（source: "rule"），流程不會卡住。
export const maxDuration = 30;

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const out = await handleLines(raw, { configured: isAIConfigured("azure"), run: writePlayLines });
  return NextResponse.json(out.body, { status: out.status });
}
