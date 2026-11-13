"use client";
// 虛擬飼養：補貨視窗（#354）。只列這隻貓年齡階段推薦的乾糧、濕糧，重用 ShopStep 的飼料卡與 costs.ts 的 shopFoods；
// 選了就交給 onChange 更新 pick，每月花費由 PlayGame 用 shopCost 重算。
import CatButton from "@/components/ui/CatButton";
import { money, shopCost, shopFoods, type PlayShop, type ShopPick, type Stage } from "@/lib/play/costs";
import { Mini3DModal } from "./mini3d/Mini3DModal";
import { FoodCard } from "./ShopStep";
import c from "./shop.module.css";
import r from "./restock.module.css";

export function RestockDialog({ pick, shop, stage, catName, onChange, onClose }: {
  pick: ShopPick; shop?: PlayShop; stage: Stage; catName: string; onChange: (p: ShopPick) => void; onClose: () => void;
}) {
  const foods = shopFoods(stage, false).filter(f => f.recommended);
  const month = shopCost(pick, stage, shop).month;
  return (
    <Mini3DModal title={`幫${catName}補貨`} onCancel={onClose}>
      <div className={r.body}>
        <p className={r.text}>選好會放進家裡，之後每月飼料花費跟著變。</p>
        {([["dry", "dryId", "乾糧"], ["wet", "wetId", "濕糧"]] as const).map(([cat, key, label]) => {
          const list = foods.filter(f => f.product.category === cat);
          return (
            <div key={cat} className={r.group}>
              <h3>{label}{pick[key] ? "（家裡有）" : "（家裡沒有）"}</h3>
              {list.length === 0 ? <p className={r.text}>這個年齡沒有推薦的{label}。</p> : (
                <ul className={c.foods}>
                  {list.map(f => <FoodCard key={f.product.id} f={f} on={pick[key] === f.product.id} onPick={() => onChange({ ...pick, [key]: f.product.id })} />)}
                </ul>
              )}
            </div>
          );
        })}
        <p className={r.cost}>目前每月花費約 {money(month)} 元</p>
        <div className={r.done}><CatButton onClick={onClose}>好了</CatButton></div>
      </div>
    </Mini3DModal>
  );
}
