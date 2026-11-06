// 補排紋理貼圖：掃全部的貓，三視角已完成但缺成貓或幼貓貼圖的排入 paint worker（idea 2：第 3 步才分流）
import { repoBackfillPaint } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS: Record<string, number> = { permission_denied: 403, disabled: 404 };

export async function POST() {
  const result = await repoBackfillPaint();
  return result.ok ? Response.json(result) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
