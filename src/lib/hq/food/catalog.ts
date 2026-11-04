import products from "./products.json";
export type FoodCategory = "dry" | "wet" | "liquid" | "other";
export type FoodPrice = { amount: number; pack: string; source: string; url: string; checkedOn: string; note: string };
export type FoodProduct = {
  id: string; officialId: string; brand: string; name: string; category: FoodCategory;
  image: string; imageSourceUrl: string; officialUrl: string;
  packs: { label: string; ean: string }[]; ages: string[];
  needs: { code: string; label: string }[]; neutered: { code: string; label: string }[];
  requiresVetDiagnosis: boolean; currency: string; referencePrice: FoodPrice | null; importedOn: string;
};
export const FOOD_PRODUCTS: readonly FoodProduct[] = products as FoodProduct[];
export const FOOD_CATEGORIES: Record<FoodCategory, string> = { dry: "乾糧", wet: "濕糧", liquid: "營養液", other: "其他（奶粉等）" };
export const FOOD_AGES: Record<string, string> = { kitten: "幼貓", adult: "成貓", mature: "熟齡貓", ageing: "老齡貓" };
export type FoodFilter = { categories?: string[]; ages?: string[]; needs?: string[]; neutered?: string[]; query?: string };
export function foodProducts(filter: FoodFilter = {}) {
  const any = (selected: string[] | undefined, values: string[]) => !selected?.length || selected.some(x => values.includes(x));
  const query = filter.query?.trim().toLocaleLowerCase() ?? "";
  return FOOD_PRODUCTS.filter(p => any(filter.categories, [p.category]) && any(filter.ages, p.ages)
    && any(filter.needs, p.needs.map(x => x.code)) && any(filter.neutered, p.neutered.map(x => x.code))
    && (!query || `${p.name} ${p.id}`.toLocaleLowerCase().includes(query)));
}
export const getFoodProduct = (id: string) => FOOD_PRODUCTS.find(p => p.id === id);
export const formatFoodPrice = (amount: number | null) => amount && Number.isFinite(amount) && amount > 0
  ? `TWD ${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amount)}` : "待查價";
/** Future purchase handlers must re-read by ID, using a server-verified diagnosis. */
export function canVirtuallyBuy(product: FoodProduct | undefined, hasVerifiedDiagnosis: boolean) {
  return Boolean(product?.referencePrice && product.referencePrice.amount > 0
    && (!product.requiresVetDiagnosis || hasVerifiedDiagnosis));
}
