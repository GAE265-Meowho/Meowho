// AI 三視角照片（#110）：標記產生中後立刻回 202，產生（約 20～60 秒）放在 after() 背景執行；畫面輪詢貓咪資料看進度。
// body：{ views?: ["left","front","back"] }，沒帶就三張都產生；單張重新產生帶一個角度。
import { after } from "next/server";
import { repoStartViews } from "@/lib/hq/cat-models/repo";
import { GEN_VIEWS } from "@/lib/hq/cat-models/types";

export const dynamic = "force-dynamic";
// 三張平行產生，留足時間（Vercel 函式上限依方案而定）
export const maxDuration = 300;

const STATUS: Record<string, number> = { ai_disabled: 503, invalid_option: 400, not_found: 404, busy: 409, permission_denied: 403, disabled: 404 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await req.json().catch(() => ({}))) as { views?: unknown };
  const result = await repoStartViews((await params).id, body.views ?? [...GEN_VIEWS]);
  if (!result.ok) return Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
  after(async () => {
    try { await result.run(); } catch (e) { console.warn("[cat-models] AI 三視角產生失敗：", e instanceof Error ? e.message : e); }
  });
  return Response.json({ ok: true }, { status: 202 });
}
