// 母體 glb：?body=kitten 幼貓（cat_base_kitten），其他成貓。本機回檔案；Supabase／bundled 導向公開網址
// ?download=1：給「下載 GLB」按鈕用，回應改成附件（檔名 base_clips.glb／base_clips_kitten.glb）
import { isCatModelsEnabled, repoReadBase } from "@/lib/hq/cat-models/repo";
import { asDownload, baseFileName } from "@/lib/hq/cat-models/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCatModelsEnabled()) return new Response(null, { status: 404 });
  const params = new URL(req.url).searchParams;
  const body = params.get("body") === "kitten" ? "kitten" : "adult";
  const download = params.get("download") === "1";
  const name = baseFileName(body);
  const glb = await repoReadBase(body);
  if (!glb) return new Response(null, { status: 404 });
  // 相對 Location 即可，瀏覽器／fetch 會依目前站台解析
  if (glb.mode === "redirect") return new Response(null, { status: 302, headers: { Location: download ? asDownload(glb.url, name) : glb.url } });
  const headers: Record<string, string> = { "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=3600" };
  if (download) headers["Content-Disposition"] = `attachment; filename="${name}"`;
  return new Response(new Uint8Array(glb.data), { headers });
}
