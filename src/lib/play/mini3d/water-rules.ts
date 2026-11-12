/** 3D 換水（虛擬飼養第 1 份）的規則：只算水量，不碰 3D。careGood("water") 只看 fill ≥ 70。 */
export const WATER_GOAL = 70;
/** 超過這個值算「滿出來」；結果仍然只回報到 100 */
export const WATER_BRIM = 105;
const MAX = 115;
/** 每秒倒進去的量（同 2D 版的水龍頭） */
const RATE = 45;

/** 水龍頭開著（overBowl）水才進得了碗；dt 上限 0.1 秒，分頁切走再回來不會一次灌滿 */
export function pourWater(fill: number, dt: number, overBowl: boolean): number {
  if (!overBowl || !(dt > 0)) return fill;
  return Math.min(MAX, fill + RATE * Math.min(dt, 0.1));
}

export function waterHint(fill: number, pouring: boolean): string {
  if (fill > WATER_BRIM) return "太滿了，灑出來了一點。";
  if (fill >= WATER_GOAL) return "水夠了，可以關水了。";
  if (pouring) return "嘩啦啦……";
  return fill > 0 ? "還不夠，再倒一點。" : "";
}

export const waterResult = (fill: number): { fill: number } => ({ fill: Math.round(Math.min(100, Math.max(0, fill))) });
