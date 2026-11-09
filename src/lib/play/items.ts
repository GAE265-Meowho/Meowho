// 虛擬飼養 DEMO（#237）：要擺進 3D 房間的生活用品（餐碗組、貓砂盆）。
// ⚠ 暫時直接寫在這裡：後台「生活用品」的 meow_items 目前只有管理員讀得到，DEMO 先用模型在公開 bucket `meow-items` 的網址，
//   尺寸（公尺）與價格（新台幣）照後台資料抄過來。等 meow_items／meow_item_categories 開放公開讀取（#237 已提醒子哲），
//   改成從後台讀用品清單，刪掉這份設定。餐碗組的路徑是 test_bowls_…（看起來是測試上傳），正式版換掉時這裡也要改。
// 模型載入失敗（沙盒、離線）時，畫面改用同尺寸的簡單方塊（FloorplanViewer 的 PlacedItemModel 外層錯誤邊界）。
// price 是後台登錄的價格，目前只作紀錄；遊戲的花費照 catgame 原版的砂盆、碗估價（costs.ts 的 SHOP_ITEMS）。

import type { PlayShop } from "./costs";

export interface PlayItem {
  id: "carrier" | "bowl" | "litter_box";
  name: string;
  url: string;
  widthM: number;
  depthM: number;
  heightM: number;
  /** 新台幣（後台登錄的價格，花費計算不用這個） */
  price: number;
}

const BUCKET = "https://onebpkbkrnnwamwsoelo.supabase.co/storage/v1/object/public/meow-items";

export const PLAY_ITEMS: readonly PlayItem[] = [
  // 外出籠：開場一定要擺（節點 1 貓躲進去、節點 6 出門看醫生）。模型 Cat Carrier by afiey.lab（CC-BY-4.0，見 public/play/cat_carrier.license.txt），
  // 放在本站 public，不用等後台上傳；尺寸（公尺）照模型比例估算。價格照原版外出籠 800 元。
  { id: "carrier", name: "外出籠", url: "/play/cat_carrier.glb", widthM: 0.33, depthM: 0.51, heightM: 0.31, price: 800 },
  { id: "bowl", name: "餐碗組", url: `${BUCKET}/test_bowls_20261104231928/model.glb`, widthM: 0.52, depthM: 0.339, heightM: 0.087, price: 399 },
  { id: "litter_box", name: "貓砂盆", url: `${BUCKET}/1b7e00eb-076b-4e85-ad4a-69e7a4e66d16/model.glb`, widthM: 0.341, depthM: 0.506, heightM: 0.379, price: 1127 },
];

/** 後台有模型（網址＋公尺尺寸）就換掉，沒有的沿用上面寫的；後台之後補上傳會自動抓到 */
export function resolvePlayItems(shop?: PlayShop): readonly PlayItem[] {
  return PLAY_ITEMS.map(it => {
    const m = shop?.models?.[it.id];
    return m ? { ...it, url: m.url, widthM: m.widthM, depthM: m.depthM, heightM: m.heightM } : it;
  });
}

export const playItem = (id: PlayItem["id"]) => PLAY_ITEMS.find(i => i.id === id)!;

/** 3D 逗貓的玩具（老鼠）：後台「逗貓棒」有模型就用後台的，沒有就用這份（後台目前登錄的老鼠，尺寸為公尺） */
export const PLAY_TOY = { url: `${BUCKET}/87c99fc9-da88-4882-94e3-7f3bc3c00d09/model.glb`, widthM: 0.054, depthM: 0.024, heightM: 0.028 };
export const resolvePlayToy = (shop?: PlayShop) => shop?.models?.toy ?? PLAY_TOY;
