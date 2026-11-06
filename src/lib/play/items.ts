// 虛擬飼養 DEMO（#237）：要擺進 3D 房間的生活用品（餐碗組、貓砂盆）。
// ⚠ 暫時直接寫在這裡：後台「生活用品」的 meow_items 目前只有管理員讀得到，DEMO 先用模型在公開 bucket `meow-items` 的網址，
//   尺寸（公尺）與價格（新台幣）照後台資料抄過來。等 meow_items／meow_item_categories 開放公開讀取（#237 已提醒子哲），
//   改成從後台讀用品清單，刪掉這份設定。餐碗組的路徑是 test_bowls_…（看起來是測試上傳），正式版換掉時這裡也要改。
// 模型載入失敗（沙盒、離線）時，畫面改用同尺寸的簡單方塊（FloorplanViewer 的 PlacedItemModel 外層錯誤邊界）。

export interface PlayItem {
  id: "bowl" | "litter_box";
  name: string;
  url: string;
  widthM: number;
  depthM: number;
  heightM: number;
  /** 新台幣，一次性購買 */
  price: number;
}

const BUCKET = "https://onebpkbkrnnwamwsoelo.supabase.co/storage/v1/object/public/meow-items";

export const PLAY_ITEMS: readonly PlayItem[] = [
  { id: "bowl", name: "餐碗組", url: `${BUCKET}/test_bowls_20261104231928/model.glb`, widthM: 0.52, depthM: 0.339, heightM: 0.087, price: 399 },
  { id: "litter_box", name: "貓砂盆", url: `${BUCKET}/1b7e00eb-076b-4e85-ad4a-69e7a4e66d16/model.glb`, widthM: 0.341, depthM: 0.506, heightM: 0.379, price: 1127 },
];

export const playItem = (id: PlayItem["id"]) => PLAY_ITEMS.find(i => i.id === id)!;
