"use client";
// 虛擬飼養：補貨視窗（#354）。重用 ShopStep 的飼料卡與 costs.ts 的 shopFoods。
// 點一下選取、再點取消（乾糧、濕糧各一款）；按「購買」才交給 onBuy 更新 pick，每月花費數字只用 shopCost（restock.ts 的 purchaseDelta）。
import { useState } from "react";
import CatButton from "@/components/ui/CatButton";
import { FOOD_AGES } from "@/lib/hq/food/catalog";
import { money, shopCost, shopFoods, type PlayShop, type ShopPick, type Stage } from "@/lib/play/costs";
import { applyPurchase, emptySel, hasPurchase, purchaseDelta, toggleSel } from "@/lib/play/restock";
import { Mini3DModal } from "./mini3d/Mini3DModal";
import { FoodCard } from "./ShopStep";
import c from "./shop.module.css";
import r from "./restock.module.css";

export function RestockDialog({ pick, shop, stage, catName, onBuy, onClose }: {
  pick: ShopPick; shop?: PlayShop; stage: Stage; catName: string; onBuy: (p: ShopPick) => void; onClose: () => void;
}) {
  const [sel, setSel] = useState(emptySel);
  const [showAll, setShowAll] = useState(false);
  const foods = shopFoods(stage, showAll);
  const stageName = FOOD_AGES[stage];
  const can = hasPurchase(pick, sel);
  const delta = purchaseDelta(pick, sel, stage, shop);
  const month = shopCost(pick, stage, shop).month;
  const buy = () => { onBuy(applyPurchase(pick, sel)); onClose(); };
  return (
    <Mini3DModal title={`幫${catName}補貨`} onCancel={onClose} wide>
      <div className={r.body}>
        <p className={r.text}>依{catName}的年紀推薦：{stageName}。選好按「購買」才會放進家裡。</p>
        <div className={r.chips} role="group" aria-label="年齡">
          <button type="button" className={r.chip} aria-pressed={!showAll} onClick={() => setShowAll(false)}>{stageName}推薦</button>
          <button type="button" className={r.chip} aria-pressed={showAll} onClick={() => setShowAll(true)}>全部年齡</button>
        </div>
        <div className={r.groups}>
          {([["dry", "dryId", "乾糧"], ["wet", "wetId", "濕糧"]] as const).map(([cat, key, label]) => {
            const list = foods.filter(f => f.product.category === cat);
            return (
              <div key={cat} className={r.group}>
                <h3>{label}{pick[key] ? "（家裡有）" : "（家裡沒有）"}</h3>
                {list.length === 0 ? <p className={r.text}>這個年齡沒有{label}，可以切到「全部年齡」看看。</p> : (
                  <ul className={c.foods}>
                    {list.map(f => <FoodCard key={f.product.id} f={f} owned={pick[key] === f.product.id} on={sel[key] === f.product.id} onPick={() => setSel(toggleSel(sel, key, f.product.id))} />)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <div className={r.done}>
          <p className={r.cost}>目前每月花費約 {money(month)} 元</p>
          <CatButton onClick={buy} disabled={!can}>{can ? `購買，每月 ${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))} 元` : "購買"}</CatButton>
        </div>
      </div>
    </Mini3DModal>
  );
}
