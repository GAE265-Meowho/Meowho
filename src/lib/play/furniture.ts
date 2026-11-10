// 虛擬飼養 DEMO（#237）：劇本裡的〈通稱〉換成房間裡真的家具，照 catgame 原版（24h 的 FURN、FURN_WORD、homeWord、fullTx）。
// 原版的家裡清單是家具 id（bed、sofa…）；DEMO 的房間物品清單是中文名稱（掃描房間的 objects[].label、娃娃屋的家具名稱），
// 這裡用關鍵字把中文名稱對回原版的家具 id，其餘規則（照順序挑家裡第一個有的、"" 代表一定有）不變。純函式。

/** 原版 FURN 的家具 id → 房間物品名稱的關鍵字 */
const FURN_MATCH: Record<string, RegExp> = {
  bed: /床/, sofa: /沙發/, desk: /書桌/, dining: /餐桌/, cabinet: /櫃/, chair: /椅/, rug: /地毯/, curtain: /窗簾/,
  window: /窗/, cup: /杯/, cable: /電線|延長線|插座|電腦|電視/, box: /紙箱/, plant: /植物|花|盆栽/, fridge: /冰箱/,
  door: /^門$|大門|玄關/, room2: /房間|臥室|房門/,
};

/** 通稱 → 照順序挑家裡第一個有的家具；值是 [家具 id, 寫進句子裡的說法]（原版 FURN_WORD） */
export const FURN_WORD: Record<string, [string, string][]> = {
  "躲藏處": [["bed", "床底"], ["sofa", "沙發底下"], ["cabinet", "櫃子後面"], ["box", "紙箱裡"], ["", "角落"]],
  "高處": [["sofa", "沙發"], ["bed", "床"], ["chair", "椅子"], ["window", "窗台"], ["cabinet", "櫃子"]],
  "布料家具": [["sofa", "沙發"], ["bed", "床邊"], ["rug", "地毯"], ["chair", "椅子"], ["", "門框"], ["box", "紙箱"]],
  "桌面": [["desk", "書桌"], ["dining", "餐桌"], ["cabinet", "櫃子"]],
  "休息處": [["window", "有陽光的窗邊"], ["sofa", "沙發"], ["bed", "床"], ["", "貓窩"]],
  "可關門的房間": [["room2", "另一個房間"]],
  "門口": [["door", "大門"], ["", "房門"]],
};

/** 家裡有沒有這種家具 */
export function homeHas(id: string, labels: string[]): boolean {
  const re = FURN_MATCH[id];
  return Boolean(re && labels.some(l => re.test(l.trim())));
}

/** 通稱換成家裡的家具說法；沒有就回 null（原版 homeWord） */
export function homeWord(k: string, labels: string[]): string | null {
  const hit = (FURN_WORD[k] ?? []).find(([id]) => id === "" || homeHas(id, labels));
  return hit ? hit[1] : null;
}

/** 通稱挑到的是哪一件家具（3D 貓走去哪用）；"" 代表沒有對應的家具 */
export function homeFurniture(k: string, labels: string[]): string {
  const hit = (FURN_WORD[k] ?? []).find(([id]) => id === "" || homeHas(id, labels));
  return hit ? hit[0] : "";
}

/** 劇本文字裡的〈通稱〉換成家裡真的家具（原版 fullTx：找不到就寫「家裡」）；〈貓名〉換成這隻貓的名字 */
export function fullTx(s: string, labels: string[], catName = "牠"): string {
  return s.replace(/〈([^〉]+)〉/g, (_m, k: string) => (k === "貓名" ? catName : homeWord(k, labels) ?? "家裡"));
}
