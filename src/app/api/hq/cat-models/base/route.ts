// 母體 glb：?body=kitten 幼貓（cat_base_kitten），其他成貓。本機回檔案；Supabase／bundled 導向公開網址
import { isCatModelsEnabled, repoReadBase } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCatModelsEnabled()) return new Response(null, { status: 404 });
  const body = new URL(req.url).searchParams.get("body") === "kitten" ? "kitten" : "adult";
  const glb = await repoReadBase(body);
  if (!glb) return new Response(null, { status: 404 });
  // 相對 Location 即可，瀏覽器／fetch 會依目前站台解析
  if (glb.mode === "redirect") return new Response(null, { status: 302, headers: { Location: glb.url } });
  return new Response(new Uint8Array(glb.data), { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=3600" } });
}
