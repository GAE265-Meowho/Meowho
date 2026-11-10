// 餐碗組的飼料碗、水碗在哪（#304，Tina 2026-11-09）：畫面從上往下對模型取樣顏色，這裡判斷哪裡是水。純函式。
// 水碗裡的水是淺藍色；飼料碗不一定好認（飼料、碗墊顏色接近），所以只找水，飼料碗取「沿長邊對稱的另一邊」。
// 座標：用品自己的座標（公尺、未旋轉；+Z＝正面），原點＝模型原點（同 FloorplanViewer 放用品的 group）。
import type { BowlSlots } from "./story";

export interface ColorSample { x: number; z: number; rgb: [number, number, number] }

/** 偏藍：藍比紅明顯多、不比綠少太多、不是暗色（0–1） */
export const isWaterColor = ([r, g, b]: [number, number, number]) => b > r + 0.08 && b >= g - 0.03 && b > 0.35;

/**
 * 從取樣點找水碗中心（偏藍點的平均），飼料碗＝以用品中心沿長邊對稱。
 * 偏藍點太少（< 3 個）回傳 null，畫面改用 defaultBowlSlots。
 * center：模型外框中心（用品座標），size：寬（X）與深（Z）。
 */
export function bowlSlotsFromSamples(samples: readonly ColorSample[], center: [number, number], size: [number, number]): BowlSlots | null {
  const blue = samples.filter(s => isWaterColor(s.rgb));
  if (blue.length < 3) return null;
  const wx = blue.reduce((a, s) => a + s.x, 0) / blue.length;
  const wz = blue.reduce((a, s) => a + s.z, 0) / blue.length;
  const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
  const alongX = size[0] >= size[1];
  // 水在正中間附近（分不出左右）就當沒辨識到
  const off = alongX ? wx - center[0] : wz - center[1];
  if (Math.abs(off) < (alongX ? size[0] : size[1]) * 0.08) return null;
  const food: [number, number] = alongX ? [r3(2 * center[0] - wx), r3(wz)] : [r3(wx), r3(2 * center[1] - wz)];
  return { food, water: [r3(wx), r3(wz)] };
}
