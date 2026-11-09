// 虛擬飼養 DEMO（#237）：採買清單與花費公式。業務規則：所有金額都由這裡的公式與資料算出，AI 不產生數字。
// 品項與估價照 catgame 原版（24h 的 SHOP_ITEMS、SHOP_FLAGS、shopCost）：貓砂類型、砂盆、碗、零食、醫療預備金，
// 加上貓抓板／外出籠／逗貓棒／監視器。只有「飼料」改用皇家目錄（src/lib/hq/food/catalog.ts）：
//   處方飼料（requiresVetDiagnosis）不顯示；沒參考價的顯示「待查價」且不能買（canVirtuallyBuy，DEMO 沒有診斷紀錄一律 false）；
//   只列皇家，其他品牌不出現；乾糧、濕糧各可選一款（原版的「只有乾糧／乾糧加濕食／濕食為主」）。
// 3D 房間裡的餐碗組、貓砂盆模型（items.ts）只是外觀，花費以這裡的砂盆、碗選項為準。
import { canVirtuallyBuy, FOOD_PRODUCTS, getFoodProduct, type FoodPrice, type FoodProduct } from "@/lib/hq/food/catalog";

export type Stage = "kitten" | "adult";

export interface PlayFood { product: FoodProduct; canBuy: boolean }

/** 遊戲裡能看到的飼料：皇家、非處方、乾糧或濕糧；stage 給值時只列該年齡層 */
export function playFoods(stage: Stage | null): PlayFood[] {
  return FOOD_PRODUCTS
    .filter(p => p.brand === "royalcanin" && !p.requiresVetDiagnosis && (p.category === "dry" || p.category === "wet"))
    .filter(p => !stage || p.ages.includes(stage))
    .map(product => ({ product, canBuy: canVirtuallyBuy(product, false) }));
}

export type Opt = readonly [string, number];
interface ShopItem { name: string; opts: readonly Opt[]; per: "month" | "once"; note?: string }

/** 原版 SHOP_ITEMS（飼料除外，改用皇家目錄） */
export const SHOP_ITEMS = {
  litter: { name: "貓砂", opts: [["礦砂", 400], ["豆腐砂", 500], ["木屑砂", 350]], per: "month", note: "貓喜不喜歡要看牠的反應" },
  box: { name: "砂盆", opts: [["開放式", 400], ["有蓋", 900], ["大尺寸", 700], ["幼貓小尺寸", 300]], per: "once" },
  bowls: { name: "碗", opts: [["一個飯碗加一個水碗", 300], ["多放幾個水碗", 600], ["飲水機", 1500]], per: "once" },
  treat: { name: "零食", opts: [["不買", 0], ["少量當獎勵", 200], ["常常給", 600]], per: "month" },
  fund: { name: "醫療預備金（每月存）", opts: [["不存", 0], ["每月 500 元", 500], ["每月 1,500 元", 1500]], per: "month" },
} as const satisfies Record<string, ShopItem>;
export type ShopItemKey = keyof typeof SHOP_ITEMS;

/** 原版 SHOP_FLAGS：勾選就買（一次性）。外出籠是中途送的（免費、一定會擺），不在清單裡 */
export const SHOP_FLAGS = { scratcher: ["貓抓板", 300], toy: ["逗貓棒", 200], cam: ["監視器", 1500] } as const;
export type ShopFlagKey = keyof typeof SHOP_FLAGS;

/** 擺進房間的模型（網址與公尺尺寸） */
export interface PlayModel { url: string; widthM: number; depthM: number; heightM: number }

/** 後台有模型的用品：外出籠、餐碗、貓砂盆（擺進房間）、逗貓棒（3D 逗貓的玩具） */
export type PlayModelKey = "carrier" | "bowl" | "litter_box" | "toy";

/** 後台生活用品（catalog.ts 算出來）：後台有就用後台，沒有就沿用這個檔案與 items.ts 裡寫的 */
export interface PlayShop {
  /** 貓抓板、逗貓棒的價格 */
  flags: Partial<Record<ShopFlagKey, number>>;
  /** 砂盆、碗的選項（品名、價格），後台之後補上傳更多品項會自動變多 */
  opts: Partial<Record<ShopItemKey, readonly Opt[]>>;
  /** 外出籠、餐碗組、貓砂盆的 3D 模型 */
  models?: Partial<Record<PlayModelKey, PlayModel>>;
}
export const flagPrice = (k: ShopFlagKey, shop?: PlayShop): number => shop?.flags[k] ?? SHOP_FLAGS[k][1];
/** 採買項目的選項：後台有就用後台，沒有就用原版 */
export const shopOpts = (k: ShopItemKey, shop?: PlayShop): readonly Opt[] => shop?.opts[k] ?? SHOP_ITEMS[k].opts;

/** 每天的份量（公克）：估算值，實際以包裝建議與獸醫說明為準。乾糧加濕食時各一半 */
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

/** 每月飼料費＝單價 ÷ 包裝克數 × 每日份量 × share × 30 天 */
export function foodMonthly(price: Pick<FoodPrice, "amount" | "pack">, category: "dry" | "wet", stage: Stage, share = 1): number | null {
  const g = packGrams(price.pack);
  if (!g || !(price.amount > 0)) return null;
  return Math.round((price.amount / g) * DAILY_GRAMS[category][stage] * share * 30);
}

export interface ShopPick {
  dryId: string | null;
  wetId: string | null;
  /** SHOP_ITEMS 各項選第幾個；null＝還沒選 */
  litter: number | null; box: number | null; bowls: number | null; treat: number | null; fund: number | null;
  scratcher: boolean; toy: boolean; cam: boolean;
  /** 玩家填的每月預算（新台幣） */
  budget: number;
}

/** 原版 onbOpen 的預設：貓抓板、逗貓棒預設勾選，監視器不勾，其他都要自己選 */
export const emptyShop = (): ShopPick => ({
  dryId: null, wetId: null, litter: null, box: null, bowls: null, treat: null, fund: null,
  scratcher: true, toy: true, cam: false, budget: 0,
});

const buyable = (id: string | null, cat: "dry" | "wet") => {
  const p = id ? getFoodProduct(id) : undefined;
  return p && p.category === cat && !p.requiresVetDiagnosis && canVirtuallyBuy(p, false) && p.referencePrice ? p : null;
};

export interface ShopCosts {
  once: number;
  /** null＝還沒選可以買的飼料 */
  food: number | null;
  month: number;
  overBudget: boolean;
  /** 還沒選的項目名稱 */
  missing: string[];
}

/** 原版 shopCost：once＝砂盆、碗＋勾選的用品；month＝飼料＋貓砂＋零食＋預備金 */
export function shopCost(sh: ShopPick, stage: Stage, shop?: PlayShop): ShopCosts {
  let once = 0, month = 0;
  const missing: string[] = [];
  for (const [k, it] of Object.entries(SHOP_ITEMS) as [ShopItemKey, ShopItem][]) {
    const i = sh[k], opts = shopOpts(k, shop);
    if (i === null || !opts[i]) { missing.push(it.name); continue; }
    if (it.per === "once") once += opts[i][1]; else month += opts[i][1];
  }
  for (const k of Object.keys(SHOP_FLAGS) as ShopFlagKey[]) if (sh[k]) once += flagPrice(k, shop);
  const dry = buyable(sh.dryId, "dry"), wet = buyable(sh.wetId, "wet");
  const share = dry && wet ? 0.5 : 1;
  const parts = [dry && foodMonthly(dry.referencePrice!, "dry", stage, share), wet && foodMonthly(wet.referencePrice!, "wet", stage, share)];
  const food = dry || wet ? parts.reduce<number>((a, x) => a + (x || 0), 0) : null;
  if (food === null) missing.unshift("飼料");
  month += food ?? 0;
  return { once, food, month, overBudget: sh.budget > 0 && month > sh.budget, missing };
}

/** 試養報告的花費：原版的五個分類 */
export interface LifeCost { once: number; month: number; med: number; acc: number; other: number }
export const costTotal = (c: LifeCost) => c.once + c.month + c.med + c.acc + c.other;

export const formatNT = (n: number) => `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n)}`;
/** 原版 money()：千分位、沒有幣別 */
export const money = (n: number) => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("zh-TW");
