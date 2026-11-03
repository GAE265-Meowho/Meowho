// 虛擬貓的外觀（#150）：用哪個體型的母體、哪張紋理貼圖。貓咪頁與虛擬體驗共用同一套規則（#129、#104）：
// 只用「已確認」的貼圖；有成貓／幼貓兩種體型時，優先用這隻貓設定的體型，沒有貼圖再換另一個體型。
import { textureOf, type BodyType, type CatModelView } from "@/lib/hq/cat-models/types";
import { baseGlbUrl, catFileUrl } from "./useCatModels";

/** 預設要看的體型 */
export function defaultBody(cat: CatModelView): BodyType {
  if (!cat.variantStorage || cat.bodyVariants?.[cat.body]?.texture.preview) return cat.body;
  return (["adult", "kitten"] as const).find(body => cat.bodyVariants?.[body]?.texture.preview) ?? cat.body;
}

/** 這個體型可以預覽的外觀；沒有可用的貼圖回 null（虛擬體驗不列出這隻貓） */
export function catLook(cat: CatModelView, body: BodyType = defaultBody(cat)): { body: BodyType; baseUrl: string; albedoUrl: string } | null {
  const variant = cat.variantStorage ? cat.bodyVariants?.[body] : undefined;
  const texture = cat.variantStorage ? variant?.texture ?? null : textureOf(cat);
  if (!texture?.preview) return null;
  const useBody = cat.variantStorage ? body : texture.previewBody ?? cat.body;
  const albedoUrl = variant
    ? (texture.preview === "albedo" ? variant.albedoUrl : variant.prevUrl)
    : catFileUrl(cat.id, texture.preview, cat.albedoVersion ?? undefined);
  return albedoUrl ? { body: useBody, baseUrl: baseGlbUrl(useBody), albedoUrl } : null;
}
