// 貓咪模型列表（本機模式，規格書 04 §4）：只在開發模式且設了 CAT_STUDIO_ROOT 時有回應，其餘一律 404。
import { listCats, localRoot } from "@/lib/hq/cat-models/local";

export const dynamic = "force-dynamic";

export async function GET() {
  const root = localRoot();
  if (!root) return Response.json({ enabled: false }, { status: 404 });
  return Response.json({ enabled: true, cats: await listCats(root) });
}
