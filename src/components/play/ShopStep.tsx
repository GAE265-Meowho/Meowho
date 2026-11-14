"use client";
/* eslint-disable @next/next/no-img-element */
// 虛擬飼養 DEMO（#237、#354）：每月預算 → 採買（照 catgame 原版 SHOP_ITEMS／SHOP_FLAGS；飼料改用皇家目錄）→ 一次性與每月花費（costs.ts 公式）。
// 飼料：處方飼料不顯示；沒參考價顯示「待查價」且不能選（canVirtuallyBuy）；乾糧、濕糧各可選一款。
//   依這隻貓的月齡（costs.ts 的 foodStage）預設只列那個階段、掛「推薦」標，可切「全部年齡」；小提示在 food-tips.ts（內容待獸醫確認）。
// 圖：已備好的用品用 public/play/thumbs/ 的 3D 截圖（scripts/render-play-thumbs.mjs 產生，跟遊戲裡同一份模型）；
//   沒有 3D 模型的（貓砂、零食、預備金、貓抓板、監視器）和沙盒連不到後台模型的（逗貓棒）先用下面 KitIcon 的 2D 圖示，之後有模型再補截。
//   砂盆的圖照選項名稱對到四款（開放式／有蓋／大尺寸／幼貓小尺寸）；後台自訂品名對不到時用開放式的圖。
// 超過預算只變色提醒，不擋下一步。商品照片在 public/hq-food/（官方圖片，見 knowledge-commerce.md 地雷）。
import { useState, type ReactNode } from "react";
import Required from "@/components/ui/Required";
import { FOOD_AGES, formatFoodPrice } from "@/lib/hq/food/catalog";
import { SHOP_FLAGS, SHOP_ITEMS, budgetUse, flagPrice, money, shopCost, shopFoods, shopOpts, type PlayShop, type ShopFlagKey, type ShopFood, type ShopItemKey, type ShopPick, type Stage } from "@/lib/play/costs";
import { FOOD_TIPS, FOOD_TIPS_NOTICE } from "@/lib/play/food-tips";
import s from "./play.module.css";
import c from "./shop.module.css";

const thumb = (name: string) => `/play/thumbs/${name}.webp`;
const BOX_THUMB: Record<string, string> = { 開放式: "litter_box_open", 有蓋: "litter_box_covered", 大尺寸: "litter_box_large", 幼貓小尺寸: "litter_box_kitten" };

type IconName = "litter" | "treat" | "fund" | "scratcher" | "toy" | "cam" | "wallet" | "bulb" | "once" | "month";
/** 2D 圖示：圓潤線條，顏色全部走 v2 token（shop.module.css 的 .ico 與 data-f） */
const ICONS: Record<IconName, ReactNode> = {
  litter: <><path data-f="yellow" d="M18 14h28l4 36a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" /><path d="M18 14l3-6h22l3 6" /><circle data-f="card" cx="32" cy="36" r="5" /><circle data-f="card" cx="24" cy="28" r="2.4" /><circle data-f="card" cx="32" cy="25" r="2.4" /><circle data-f="card" cx="40" cy="28" r="2.4" /></>,
  treat: <><path data-f="orange" d="M10 32c8-12 24-12 34-2l10-8v20l-10-8c-10 10-26 10-34-2z" /><circle data-f="ink" cx="20" cy="30" r="1.6" /><path d="M30 26c3 4 3 8 0 12" /></>,
  fund: <><rect data-f="mint" x="10" y="18" width="44" height="34" rx="9" /><path d="M24 18v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" /><path data-f="card" d="M28 27h8v5h5v8h-5v5h-8v-5h-5v-8h5z" /></>,
  scratcher: <><rect data-f="yellow" x="12" y="48" width="40" height="8" rx="4" /><rect data-f="orange" x="25" y="12" width="14" height="36" rx="5" /><path d="M25 22h14M25 30h14M25 38h14" /><circle data-f="pink" cx="32" cy="9" r="4" /></>,
  toy: <><path d="M10 54L40 20" /><path d="M40 20c6-2 8 2 12 0" /><path data-f="pink" d="M52 20c5 2 6 9 2 13-5-1-7-8-2-13z" /><path data-f="yellow" d="M49 22c-5 3-5 9-1 12" /><circle data-f="orange" cx="10" cy="54" r="3" /></>,
  cam: <><rect data-f="card" x="14" y="10" width="36" height="30" rx="12" /><circle data-f="yellow" cx="32" cy="25" r="8" /><circle data-f="ink" cx="32" cy="25" r="3" /><path d="M32 40v8" /><rect data-f="orange" x="20" y="48" width="24" height="7" rx="3.5" /></>,
  wallet: <><rect data-f="orange" x="8" y="16" width="48" height="36" rx="9" /><path d="M8 26h48" /><rect data-f="yellow" x="38" y="30" width="18" height="12" rx="6" /><circle data-f="ink" cx="45" cy="36" r="1.8" /></>,
  bulb: <><path data-f="yellow" d="M32 8a16 16 0 0 0-9 29c2 2 3 4 3 7h12c0-3 1-5 3-7a16 16 0 0 0-9-29z" /><path d="M26 50h12M28 56h8" /></>,
  once: <><path data-f="yellow" d="M12 24h40l-4 28a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4z" /><path d="M22 24c0-16 20-16 20 0" /></>,
  month: <><rect data-f="card" x="10" y="14" width="44" height="40" rx="9" /><path data-f="orange" d="M10 26v-3a9 9 0 0 1 9-9h26a9 9 0 0 1 9 9v3z" /><path d="M22 9v9M42 9v9" /><circle data-f="yellow" cx="32" cy="40" r="6" /></>,
};
const KitIcon = ({ name }: { name: IconName }) => <svg className={c.ico} viewBox="0 0 64 64" aria-hidden="true" focusable="false">{ICONS[name]}</svg>;
const Thumb = ({ name }: { name: string }) => <img src={thumb(name)} alt="" width={256} height={256} loading="lazy" />;

function FoodCard({ f, on, onPick }: { f: ShopFood; on: boolean; onPick: () => void }) {
  const p = f.product;
  return (
    <li>
      <button type="button" className={c.food} aria-pressed={on} disabled={!f.canBuy} onClick={onPick}>
        <span className={c.foodImg}>
          <img src={p.image} alt="" loading="lazy" />
          {f.recommended && <span className={c.badge}>推薦</span>}
          {on && <svg className={c.check} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" /><path d="M6.5 12.5l3.5 3.5 7-8" /></svg>}
        </span>
        <span className={c.foodName}>{p.name}</span>
        <span className={c.price}>{p.referencePrice ? `${formatFoodPrice(p.referencePrice.amount)}／${p.referencePrice.pack}` : "待查價"}</span>
      </button>
    </li>
  );
}

export function ShopStep({ pick, shop, onChange, stage, catName }: { pick: ShopPick; shop?: PlayShop; onChange: (p: ShopPick) => void; stage: Stage; catName: string }) {
  const [showAll, setShowAll] = useState(false);
  const foods = shopFoods(stage, showAll);
  const costs = shopCost(pick, stage, shop);
  const use = budgetUse(costs.month, pick.budget);
  const set = (patch: Partial<ShopPick>) => onChange({ ...pick, ...patch });
  const stageName = FOOD_AGES[stage];

  // 已備好的用品：圖＋名稱＋價格。外出籠是中途送的（不在 SHOP_FLAGS、不算花費），放第一張
  const kit: { key: string; art: ReactNode; name: string; detail?: string; price: string }[] = [
    { key: "carrier", art: <Thumb name="carrier" />, name: "外出籠", price: "中途送的" },
  ];
  const ITEM_ART: Record<ShopItemKey, (opt: string) => ReactNode> = {
    box: opt => <Thumb name={BOX_THUMB[opt] ?? "litter_box_open"} />, bowls: () => <Thumb name="bowls" />,
    litter: () => <KitIcon name="litter" />, treat: () => <KitIcon name="treat" />, fund: () => <KitIcon name="fund" />,
  };
  for (const k of ["box", "bowls", "litter", "treat", "fund"] as const) {
    const it = SHOP_ITEMS[k], o = pick[k] === null ? null : shopOpts(k, shop)[pick[k]!];
    if (o) kit.push({ key: k, art: ITEM_ART[k](o[0]), name: k === "fund" ? "醫療預備金" : it.name, detail: o[0], price: `${money(o[1])} 元${it.per === "month" ? "／月" : ""}` });
  }
  for (const k of Object.keys(SHOP_FLAGS) as ShopFlagKey[]) {
    if (pick[k]) kit.push({ key: k, art: <KitIcon name={k} />, name: SHOP_FLAGS[k][0], price: `${money(flagPrice(k, shop))} 元` });
  }

  return (
    <>
      <section className={`${s.card} ${c.budget}`} aria-labelledby="budget-title">
        <span className={c.art}><KitIcon name="wallet" /></span>
        <div className={c.budgetBody}>
          <h2 id="budget-title">每月預算</h2>
          <label className={s.field}>
            <span className={c.text}>每個月可以花在貓身上的錢（新台幣）<Required /></span>
            <input className={s.input} type="number" inputMode="numeric" min={0} step={100}
              value={pick.budget || ""} placeholder="例如 3000"
              onChange={e => set({ budget: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          </label>
        </div>
      </section>

      <section className={s.card} aria-labelledby="food-title">
        <h2 id="food-title">幫{catName}選飼料<Required /></h2>
        <div className={c.tips}>
          <span className={c.tipsArt}><KitIcon name="bulb" /></span>
          <div>
            <p className={c.tipsHead}>{catName}現在是{stageName}</p>
            {FOOD_TIPS[stage].map(t => <p key={t} className={c.text}>{t}</p>)}
            <p className={c.text}>{FOOD_TIPS_NOTICE}</p>
          </div>
        </div>
        <div className={s.chips} role="group" aria-label="年齡">
          <button type="button" className={`${s.chipBtn} ${c.chip}`} aria-pressed={!showAll} onClick={() => setShowAll(false)}>{stageName}推薦</button>
          <button type="button" className={`${s.chipBtn} ${c.chip}`} aria-pressed={showAll} onClick={() => setShowAll(true)}>全部年齡</button>
        </div>
        {([["dry", "dryId", "乾糧", "feed_bag"], ["wet", "wetId", "濕糧", "feed_can"]] as const).map(([cat, key, label, art]) => {
          const list = foods.filter(f => f.product.category === cat);
          return (
            <div key={cat} className={c.group}>
              <h3 className={c.groupHead}><span className={c.groupArt}><Thumb name={art} /></span>{label}<span className={c.groupNote}>{pick[key] ? "已選一款" : "選一款"}</span></h3>
              {list.length === 0 ? <p className={c.text}>這個年齡沒有{label}，可以切到「全部年齡」看看。</p> : (
                <ul className={c.foods}>
                  {list.map(f => <FoodCard key={f.product.id} f={f} on={pick[key] === f.product.id} onPick={() => set({ [key]: pick[key] === f.product.id ? null : f.product.id })} />)}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className={s.card} aria-labelledby="kit-title">
        <h2 id="kit-title">已經準備好的東西</h2>
        <ul className={c.kit}>
          {kit.map(k => (
            <li key={k.key} className={c.kitCard}>
              <span className={c.kitArt}>{k.art}</span>
              <span className={c.kitName}>{k.name}</span>
              {k.detail && <span className={c.kitDetail}>{k.detail}</span>}
              <span className={c.kitPrice}>{k.price}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.card} aria-labelledby="sum-title" aria-live="polite">
        <h2 id="sum-title">花費</h2>
        <div className={c.meter} data-over={use?.over || undefined}>
          <p className={c.meterHead}>
            <span>每月 <b>{money(costs.month)}</b> 元</span>
            <span>{use ? `預算 ${money(pick.budget)} 元` : "還沒填預算"}</span>
          </p>
          <div className={c.bar} role="img" aria-label={use ? `每月花費佔預算 ${use.percent}%` : "還沒填預算"}>
            <span className={c.fill} style={{ width: `${use?.bar ?? 0}%` }} />
          </div>
          {use && <p className={c.meterNote}>{use.over ? `超過預算 ${money(-use.left)} 元` : `用掉預算的 ${use.percent}%，還剩 ${money(use.left)} 元`}</p>}
        </div>
        <ul className={c.stats}>
          <li><KitIcon name="once" /><span className={c.statLabel}>一次買齊的用品</span><b>{money(costs.once)} 元</b></li>
          <li><span className={c.statArt}><Thumb name="feed_bag" /></span><span className={c.statLabel}>每月飼料</span><b>{costs.food === null ? "還沒選" : `${money(costs.food)} 元`}</b></li>
          <li><KitIcon name="month" /><span className={c.statLabel}>每月貓砂、零食、預備金</span><b>{money(costs.month - (costs.food ?? 0))} 元</b></li>
        </ul>
      </section>
    </>
  );
}
