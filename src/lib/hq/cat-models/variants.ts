import { bodyFor, textureInfo, type BodyType, type TextureInfo } from "./types";

/** 每個體型有獨立的目前版、上一版與人工確認結果。 */
export type Variant = {
  albedo: string | null;
  prev: string | null;
  baseVersion: string | null;
  prevBaseVersion: string | null;
  confirmed: string | null;
};

export type Variants = Partial<Record<BodyType, Variant>>;

export function prepareVariant(variant: Variant): { variant: Variant; remove: string | null } {
  if (variant.albedo && variant.prev && variant.confirmed === variant.prev) {
    return { variant: { ...variant, albedo: variant.prev, prev: null, baseVersion: variant.prevBaseVersion, prevBaseVersion: null }, remove: variant.albedo };
  }
  return { variant, remove: null };
}

export function confirmVariant(variant: Variant): Variant {
  return { ...variant, confirmed: variant.albedo };
}

export function restoreVariant(variant: Variant): Variant {
  return { albedo: variant.prev, prev: variant.albedo, baseVersion: variant.prevBaseVersion,
    prevBaseVersion: variant.baseVersion, confirmed: variant.prev };
}

type Legacy = {
  albedo: string | null;
  prev: string | null;
  baseVersion: string | null;
  prevBaseVersion: string | null;
  confirmed: string | null | undefined;
  ageMonths: number | null;
};

/** #104：搬移舊欄位時依各貼圖自己的母體分組，絕不把另一體型當成「上一版」。 */
export function legacyVariants(input: Legacy): Variants {
  const out: Variants = {};
  if (!input.albedo) return out;
  const currentBody = bodyFor({ baseVersion: input.baseVersion, hasAlbedo: true, ageMonths: input.ageMonths });
  const confirmed = input.confirmed === undefined ? input.albedo : input.confirmed;
  out[currentBody] = {
    albedo: input.albedo,
    prev: null,
    baseVersion: input.baseVersion,
    prevBaseVersion: null,
    confirmed: confirmed === input.albedo ? input.albedo : null,
  };
  if (input.prev) {
    const prevBody = bodyFor({ baseVersion: input.prevBaseVersion, hasAlbedo: true, ageMonths: input.ageMonths });
    if (prevBody === currentBody) {
      out[currentBody]!.prev = input.prev;
      out[currentBody]!.prevBaseVersion = input.prevBaseVersion;
      if (confirmed === input.prev) out[currentBody]!.confirmed = input.prev;
    } else {
      out[prevBody] = {
        albedo: input.prev,
        prev: null,
        baseVersion: input.prevBaseVersion,
        prevBaseVersion: null,
        confirmed: confirmed === input.prev ? input.prev : null,
      };
    }
  }
  return out;
}

export function variantTexture(variants: Variants, body: BodyType): TextureInfo {
  const variant = variants[body];
  return textureInfo({
    albedo: variant?.albedo ?? null,
    prev: variant?.prev ?? null,
    confirmed: variant?.confirmed ?? null,
    baseVersion: variant?.baseVersion ?? null,
    prevBaseVersion: variant?.prevBaseVersion ?? null,
    ageMonths: null,
  });
}
