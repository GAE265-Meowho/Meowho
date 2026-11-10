"use client";
/* eslint-disable @next/next/no-img-element */
// 虛擬飼養 DEMO（#237）：每月預算 → 採買（照 catgame 原版 SHOP_ITEMS／SHOP_FLAGS；飼料改用皇家目錄）→ 一次性與每月花費（costs.ts 公式）。
// 飼料：處方飼料不顯示；沒參考價顯示「待查價」且不能選（canVirtuallyBuy）；預設只列幼貓；乾糧、濕糧各可選一款。
// 超過預算只用紅字提醒，不擋下一步。商品照片在 public/hq-food/（官方圖片，見 knowledge-commerce.md 地雷）。
import { useMemo, useState } from "react";
import Required from "@/components/ui/Required";
import { formatFoodPrice } from "@/lib/hq/food/catalog";
import { SHOP_FLAGS, SHOP_ITEMS, flagPrice, money, playFoods, shopCost, shopOpts, type PlayShop, type ShopFlagKey, type ShopItemKey, type ShopPick } from "@/lib/play/costs";
import s from "./play.module.css";

export function ShopStep({ pick, shop, onChange }: { pick: ShopPick; shop?: PlayShop; onChange: (p: ShopPick) => void }) {
  const [kittenOnly, setKittenOnly] = useState(true);
  const foods = useMemo(() => playFoods(kittenOnly ? "kitten" : null), [kittenOnly]);
  const costs = shopCost(pick, "kitten", shop);
  const set = (patch: Partial<ShopPick>) => onChange({ ...pick, ...patch });

  return (
    <>
      <section className={s.card} aria-labelledby="budget-title">
        <h2 id="budget-title">每月預算</h2>
        <label className={s.field}>
          <span className={s.label}>每個月可以花在貓身上的錢（新台幣）<Required /></span>
          <input className={s.input} type="number" inputMode="numeric" min={0} step={100}
            value={pick.budget || ""} placeholder="例如 3000"
            onChange={e => set({ budget: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </label>
      </section>

      <section className={s.card} aria-labelledby="food-title">
        <h2 id="food-title">飼料<Required /></h2>
        <p className={s.lead}>乾糧、濕糧各可以選一款。</p>
        <div className={s.chips} role="group" aria-label="年齡">
          <button type="button" className={s.chipBtn} aria-pressed={kittenOnly} onClick={() => setKittenOnly(true)}>幼貓</button>
          <button type="button" className={s.chipBtn} aria-pressed={!kittenOnly} onClick={() => setKittenOnly(false)}>全部年齡</button>
        </div>
        <ul className={s.foods}>
          {foods.map(({ product: p, canBuy }) => {
            const key = p.category === "dry" ? "dryId" : "wetId";
            const on = pick[key] === p.id;
            return (
              <li key={p.id}>
                <button type="button" className={s.food} aria-pressed={on} disabled={!canBuy}
                  onClick={() => set({ [key]: on ? null : p.id })}>
                  <span className={s.foodImg}><img src={p.image} alt={p.name} loading="lazy" /></span>
                  <span className={s.foodName}>{p.category === "dry" ? "乾糧・" : "濕糧・"}{p.name}</span>
                  <span className={s.price}>{p.referencePrice ? `${formatFoodPrice(p.referencePrice.amount)}／${p.referencePrice.pack}` : "待查價"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={s.card} aria-labelledby="kit-title">
        <h2 id="kit-title">用品已經幫你備好</h2>
        <p className={s.lead}>貓砂、砂盆、碗、零食、醫療預備金和玩具都用預設的，不用選。</p>
        <ul className={s.kit}>
          {(Object.entries(SHOP_ITEMS) as [ShopItemKey, (typeof SHOP_ITEMS)[ShopItemKey]][]).map(([k, it]) => {
            const o = pick[k] === null ? null : shopOpts(k, shop)[pick[k]!];
            return o && <li key={k}><span>{it.name}・{o[0]}</span><span>{money(o[1])} 元{it.per === "month" ? "／月" : ""}</span></li>;
          })}
          {(Object.entries(SHOP_FLAGS) as [ShopFlagKey, readonly [string, number]][]).filter(([k]) => pick[k]).map(([k, [label]]) => (
            <li key={k}><span>{label}</span><span>{money(flagPrice(k, shop))} 元</span></li>
          ))}
        </ul>
      </section>

      <section className={s.card} aria-labelledby="sum-title" aria-live="polite">
        <h2 id="sum-title">花費</h2>
        <dl className={s.sum}>
          <dt>一次性（用品）</dt><dd>{money(costs.once)} 元</dd>
          <dt>每月飼料</dt><dd>{costs.food === null ? "還沒選" : `${money(costs.food)} 元`}</dd>
          <dt>每月合計（飼料、貓砂、零食、預備金）</dt><dd>{money(costs.month)} 元</dd>
        </dl>
        {costs.overBudget && <p className={s.over}>每月花費超過預算 {money(costs.month - pick.budget)} 元</p>}
      </section>
    </>
  );
}
