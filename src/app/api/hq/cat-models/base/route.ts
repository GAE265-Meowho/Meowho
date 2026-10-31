// 共用母體 base_clips.glb：本機回檔案；bundled 導向 public
import { isCatModelsEnabled, repoReadBase } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isCatModelsEnabled()) return new Response(null, { status: 404 });
  const glb = await repoReadBase();
  if (!glb) return new Response(null, { status: 404 });
  // 相對 Location 即可，瀏覽器／fetch 會依目前站台解析
  if (glb.mode === "redirect") return new Response(null, { status: 302, headers: { Location: glb.url } });
  return new Response(new Uint8Array(glb.data), { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=3600" } });
}
