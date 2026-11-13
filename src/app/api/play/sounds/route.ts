// 虛擬飼養：Storage 裡已經有哪些音檔（#393）。遊戲和 MeowHQ 音效分頁都讀這裡；公開資訊，不用登入。
import { listSoundFiles } from "@/lib/play/sounds-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const files = await listSoundFiles();
  if (!files) return Response.json({ files: null }, { status: 503 });
  return Response.json({ files }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
}
