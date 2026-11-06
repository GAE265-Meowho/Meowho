// 虛擬飼養 DEMO（#237）：採買清單與花費公式。業務規則：所有金額都由這裡的公式與資料算出，AI 不產生數字。
// 飼料：皇家商品目錄（src/lib/hq/food/catalog.ts）。處方飼料（requiresVetDiagnosis）不顯示；沒參考價的顯示「待查價」且不能買
// （canVirtuallyBuy，DEMO 沒有獸醫診斷紀錄，一律傳 false）。品牌規則：只列皇家，其他品牌不出現。
// 用品價格：餐碗組、貓砂盆來自 items.ts（後台生活用品）；其他用品與貓砂是 DEMO 的估算值，之後和 #233 的交接用品清單對齊。
import { canVirtuallyBuy, FOOD_PRODUCTS, getFoodProduct, type FoodPrice, type FoodProduct } from "@/lib/hq/food/catalog";
import { playItem } from "./items";

export type Stage = "kitten" | "adult";

export interface PlayFood { product: FoodProduct; canBuy: boolean }

/** 遊戲裡能看到的飼料：皇家、非處方；stage 給值時只列該年齡層 */
export function playFoods(stage: Stage | null): PlayFood[] {
  return FOOD_PRODUCTS
    .filter(p => p.brand === "royalcanin" && !p.requiresVetDiagnosis && (p.category === "dry" || p.category === "wet"))
    .filter(p => !stage || p.ages.includes(stage))
    .map(product => ({ product, canBuy: canVirtuallyBuy(product, false) }));
}

/** 貓砂只講類型（不指定品牌）；每月用量的估算金額 */
export const LITTER_TYPES = [
  { id: "mineral", name: "礦砂", monthly: 350, note: "結塊快、便宜，粉塵比較多" },
  { id: "tofu", name: "豆腐砂", monthly: 450, note: "粉塵少，可以少量沖馬桶" },
  { id: "wood", name: "木屑砂", monthly: 400, note: "吸味好，要搭配雙層貓砂盆" },
] as const;
export type LitterId = (typeof LITTER_TYPES)[number]["id"];

export interface Supply { id: string; name: string; price: number; required: boolean }
/** 基本用品（一次性）；required＝劇情會用到，預設勾選 */
export const SUPPLIES: readonly Supply[] = [
  { id: "bowl", name: playItem("bowl").name, price: playItem("bowl").price, required: true },
  { id: "litter_box", name: playItem("litter_box").name, price: playItem("litter_box").price, required: true },
  { id: "carrier", name: "外出籠", price: 1200, required: true },
  { id: "nail_clipper", name: "指甲剪", price: 220, required: false },
  { id: "scratcher", name: "貓抓板", price: 300, required: false },
  { id: "brush", name: "梳子", price: 250, required: false },
  { id: "toy", name: "逗貓棒", price: 150, required: false },
  { id: "bed", name: "貓窩", price: 650, required: false },
];

/** 每天的份量（公克）：乾糧、濕糧；估算值，實際以包裝建議與獸醫說明為準 */
const DAILY_GRAMS: Record<"dry" | "wet", Record<Stage, number>> = {
  dry: { kitten: 50, adult: 60 },
  wet: { kitten: 200, adult: 250 },
};

/** 包裝重量：「2 kg」「400 g」「12 x 85 g」；看不懂回 null */
export function packGrams(pack: string): number | null {
  const m = pack.replace(/\s+/g, "").toLowerCase().match(/^(?:(\d+)x)?(\d+(?:\.\d+)?)(kg|g)$/);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const grams = Number(m[2]) * (m[3] === "kg" ? 1000 : 1);
  return Math.round(count * grams);
}

/** 每月飼料費＝單價 ÷ 包裝克數 × 每日份量 × 30 天 */
export function foodMonthly(price: Pick<FoodPrice, "amount" | "pack">, category: "dry" | "wet", stage: Stage): number | null {
  const g = packGrams(price.pack);
  if (!g || !(price.amount > 0)) return null;
  return Math.round((price.amount / g) * DAILY_GRAMS[category][stage] * 30);
}

export interface ShopPick {
  foodId: string | null;
  litter: LitterId;
  supplies: string[];
  /** 玩家填的每月預算（新台幣） */
  budget: number;
}

export interface ShopCosts {
  oneTime: number;
  /** null＝飼料待查價或不能買，不算進每月 */
  foodMonthly: number | null;
  litterMonthly: number;
  monthly: number;
  overBudget: boolean;
}

export function shopCosts(pick: ShopPick, stage: Stage): ShopCosts {
  const oneTime = SUPPLIES.filter(s => pick.supplies.includes(s.id)).reduce((a, s) => a + s.price, 0);
  const product = pick.foodId ? getFoodProduct(pick.foodId) : undefined;
  const buyable = product && !product.requiresVetDiagnosis && canVirtuallyBuy(product, false) && product.referencePrice;
  const food = buyable && (product.category === "dry" || product.category === "wet")
    ? foodMonthly(product.referencePrice!, product.category, stage) : null;
  const litterMonthly = LITTER_TYPES.find(l => l.id === pick.litter)?.monthly ?? 0;
  const monthly = (food ?? 0) + litterMonthly;
  return { oneTime, foodMonthly: food, litterMonthly, monthly, overBudget: pick.budget > 0 && monthly > pick.budget };
}

export type CostCategory = "oneTime" | "medical" | "accident";
export interface ChoiceCost { category: CostCategory; amount: number }

export interface ReportCosts { oneTime: number; monthly: number; medical: number; accident: number; total: number }

/** 試養報告的花費：採買＋劇情選擇（醫療、意外、其他一次性） */
export function reportCosts(shop: ShopCosts, choices: ChoiceCost[]): ReportCosts {
  const sum = (c: CostCategory) => choices.filter(x => x.category === c).reduce((a, x) => a + x.amount, 0);
  const oneTime = shop.oneTime + sum("oneTime");
  const medical = sum("medical");
  const accident = sum("accident");
  return { oneTime, monthly: shop.monthly, medical, accident, total: oneTime + medical + accident };
}

export const formatNT = (n: number) => `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n)}`;
