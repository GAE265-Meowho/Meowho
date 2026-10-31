// 單隻貓咪模型（本機模式）
import { getCat, localRoot } from "@/lib/hq/cat-models/local";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const root = localRoot();
  if (!root) return Response.json({ enabled: false }, { status: 404 });
  const cat = await getCat(root, (await params).id);
  return cat ? Response.json({ enabled: true, cat }) : Response.json({ enabled: true, cat: null }, { status: 404 });
}
