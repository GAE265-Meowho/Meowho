// 共用母體 base_clips.glb（本機模式）：所有貓咪共用這一份身體、骨架、眼球與全部動作
import { localRoot, readBaseGlb } from "@/lib/hq/cat-models/local";

export const dynamic = "force-dynamic";

export async function GET() {
  const root = localRoot();
  if (!root) return new Response(null, { status: 404 });
  const glb = await readBaseGlb(root);
  if (!glb) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(glb), { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "no-cache" } });
}
