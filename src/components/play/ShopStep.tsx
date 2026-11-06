"use client";
/* eslint-disable @next/next/no-img-element */
// 虛擬飼養 DEMO（#237）：每月預算 → 飼料、貓砂、基本用品 → 一次性與每月花費（全部由 src/lib/play/costs.ts 的公式算）。
// 飼料：皇家目錄，處方飼料不顯示；沒參考價顯示「待查價」且不能選（canVirtuallyBuy）。幼貓階段預設只列幼貓。
// 超過預算只用紅字提醒，不擋下一步。商品照片在 public/hq-food/（官方圖片，見 knowledge-commerce.md 地雷）。
import { useMemo, useState } from "react";
import Required from "@/components/ui/Required";
import { formatFoodPrice } from "@/lib/hq/food/catalog";
import { LITTER_TYPES, SUPPLIES, formatNT, playFoods, shopCosts, type ShopPick } from "@/lib/play/costs";
import s from "./play.module.css";

export function ShopStep({ pick, onChange }: { pick: ShopPick; onChange: (p: ShopPick) => void }) {
  const [kittenOnly, setKittenOnly] = useState(true);
  const foods = useMemo(() => playFoods(kittenOnly ? "kitten" : null), [kittenOnly]);
  const costs = shopCosts(pick, "kitten");
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
        <h2 id="food-title">飼料</h2>
        <div className={s.chips} role="group" aria-label="年齡">
          <button type="button" className={s.chipBtn} aria-pressed={kittenOnly} onClick={() => setKittenOnly(true)}>幼貓</button>
          <button type="button" className={s.chipBtn} aria-pressed={!kittenOnly} onClick={() => setKittenOnly(false)}>全部年齡</button>
        </div>
        <ul className={s.foods}>
          {foods.map(({ product: p, canBuy }) => (
            <li key={p.id}>
              <button type="button" className={s.food} aria-pressed={pick.foodId === p.id} disabled={!canBuy}
                onClick={() => set({ foodId: p.id })}>
                <span className={s.foodImg}><img src={p.image} alt={p.name} loading="lazy" /></span>
                <span className={s.foodName}>{p.name}</span>
                <span className={s.price}>{p.referencePrice ? `${formatFoodPrice(p.referencePrice.amount)}／${p.referencePrice.pack}` : "待查價"}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.card} aria-labelledby="litter-title">
        <h2 id="litter-title">貓砂</h2>
        <div className={s.list} role="radiogroup" aria-labelledby="litter-title">
          {LITTER_TYPES.map(l => (
            <label key={l.id} className={s.check}>
              <input type="radio" name="litter" checked={pick.litter === l.id} onChange={() => set({ litter: l.id })} />
              {l.name}：{l.note}
            </label>
          ))}
        </div>
      </section>

      <section className={s.card} aria-labelledby="supply-title">
        <h2 id="supply-title">基本用品</h2>
        <div className={s.list}>
          {SUPPLIES.map(x => (
            <label key={x.id} className={s.check}>
              <input type="checkbox" checked={pick.supplies.includes(x.id)}
                onChange={e => set({ supplies: e.target.checked ? [...pick.supplies, x.id] : pick.supplies.filter(i => i !== x.id) })} />
              {x.name}　{formatNT(x.price)}
            </label>
          ))}
        </div>
      </section>

      <section className={s.card} aria-labelledby="sum-title" aria-live="polite">
        <h2 id="sum-title">花費</h2>
        <dl className={s.sum}>
          <dt>一次性（用品）</dt><dd>{formatNT(costs.oneTime)}</dd>
          <dt>每月飼料</dt><dd>{costs.foodMonthly === null ? "還沒選" : formatNT(costs.foodMonthly)}</dd>
          <dt>每月貓砂</dt><dd>{formatNT(costs.litterMonthly)}</dd>
          <dt>每月合計</dt><dd>{formatNT(costs.monthly)}</dd>
        </dl>
        {costs.overBudget && <p className={s.over}>每月花費超過預算 {formatNT(costs.monthly - pick.budget)}</p>}
      </section>
    </>
  );
}
