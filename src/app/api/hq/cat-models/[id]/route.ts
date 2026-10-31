// 單隻貓咪模型
import { isCatModelsEnabled, repoGetCat } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isCatModelsEnabled()) return Response.json({ enabled: false }, { status: 404 });
  const cat = await repoGetCat((await params).id);
  return cat ? Response.json({ enabled: true, cat }) : Response.json({ enabled: true, cat: null }, { status: 404 });
}
