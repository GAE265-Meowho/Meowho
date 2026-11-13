// 虛擬飼養：後台「生活用品」（meow_items）→ 遊戲的價格、選項、3D 模型。
// 原則：後台有就用後台，沒有（品項不存在、沒填價格、模型缺尺寸）就沿用程式裡寫的（costs.ts 的原版估價、items.ts 的模型）。
// 後台之後補上傳新品項，遊戲會自動抓到：貓砂盆、餐碗水碗的每個品項都是一個選項，不用改程式。
// 前台玩家讀不到 meow_items（RLS 只給管理員），所以由伺服器 API /api/play/items 代讀，只回傳這裡定義的欄位。
// 外出籠是中途送的（免費），後台的價格不計；貓砂、零食、醫療預備金沒有後台品項，維持原版估價。
import type { Opt, PlayModel, PlayModelKey, PlayShop, ShopFlagKey, ShopItemKey } from "./costs";

export interface PlayCatalogItem {
  categoryName: string; name: string; priceTwd: number | null;
  modelUrl: string | null; widthM: number | null; depthM: number | null; heightM: number | null;
}

interface Row {
  name: string; price_twd: number | null; model_path: string | null;
  width_m: number | null; depth_m: number | null; height_m: number | null;
  meow_item_categories: { name: string } | null;
}

const pos = (v: unknown): number | null => { const n = Number(v); return v != null && Number.isFinite(n) && n > 0 ? n : null; };

/** 後台資料列 → 前台能看的清單（沒有類別的略過；價格、尺寸不是正數當成沒有） */
export function toPlayCatalog(rows: readonly Row[], publicUrl: (path: string) => string): PlayCatalogItem[] {
  return rows.flatMap(r => {
    const categoryName = r.meow_item_categories?.name;
    if (!categoryName) return [];
    const price = pos(r.price_twd);
    return [{
      categoryName, name: r.name, priceTwd: price === null ? null : Math.round(price),
      modelUrl: r.model_path ? publicUrl(r.model_path) : null,
      widthM: pos(r.width_m), depthM: pos(r.depth_m), heightM: pos(r.height_m),
    }];
  });
}

/** 後台類別名稱 → 遊戲裡的用途 */
const FLAG_CATEGORY: Record<string, ShopFlagKey> = { 貓抓板: "scratcher", 逗貓棒: "toy" };
const OPTS_CATEGORY: Record<string, Extract<ShopItemKey, "box" | "bowls">> = { 貓砂盆: "box", 餐碗水碗: "bowls" };
const MODEL_CATEGORY: Record<string, PlayModelKey> = { 外出籠: "carrier", 餐碗水碗: "bowl", 貓砂盆: "litter_box", 逗貓棒: "toy" };
/** 最長邊至少要這麼長（公尺）才採用：後台尺寸填錯（例如貓砂盆 13 公分）時，房間裡會出現貓進不去的迷你用品 */
const MIN_LONG_SIDE_M: Partial<Record<PlayModelKey, number>> = { carrier: 0.3, bowl: 0.15, litter_box: 0.3 };

const toModel = (it: PlayCatalogItem): PlayModel | null =>
  it.modelUrl && it.widthM && it.depthM && it.heightM ? { url: it.modelUrl, widthM: it.widthM, depthM: it.depthM, heightM: it.heightM } : null;

export function playShop(items: readonly PlayCatalogItem[]): PlayShop {
  const shop: PlayShop = { flags: {}, opts: {}, models: {} };
  const priced = [...items].filter(i => i.priceTwd !== null).sort((a, b) => a.priceTwd! - b.priceTwd!);
  // 價格由低到高；同類多個貓抓板、逗貓棒時取最便宜的
  for (const it of priced) {
    const flag = FLAG_CATEGORY[it.categoryName];
    if (flag && shop.flags[flag] === undefined) shop.flags[flag] = it.priceTwd!;
    const opt = OPTS_CATEGORY[it.categoryName];
    if (opt) shop.opts[opt] = [...(shop.opts[opt] ?? []), [it.name, it.priceTwd!] as Opt];
  }
  // 模型：同類先用有價格（最便宜）的，再用沒價格的；要網址和三個尺寸都有、而且尺寸合理才採用，不合理就看下一個
  for (const it of [...priced, ...items.filter(i => i.priceTwd === null)]) {
    const m = MODEL_CATEGORY[it.categoryName];
    if (!m || shop.models![m]) continue;
    const model = toModel(it);
    if (model && Math.max(model.widthM, model.depthM, model.heightM) >= (MIN_LONG_SIDE_M[m] ?? 0)) shop.models![m] = model;
  }
  return shop;
}
