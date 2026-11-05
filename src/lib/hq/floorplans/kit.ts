// 平面圖轉換的家具模型庫（#138，Tina 2026-11-03）：每種家具一個 glb（public/hq-floorplan/furniture/<kind>.glb），
// 由 scripts/blender/furniture_kit.py 產生（沿用 Meow/meowho_3d_room 的材質與建模做法）。
// 下面的尺寸要和 kit.json 一致（測試會檢查）：網頁把模型縮放成 AI 讀到的寬（w）、深（d）、高（ref_h 對應的高度）。
// 模型正面朝 +Z、底部中心在原點。
import type { FLOORPLAN_FURNITURE_KINDS } from "@/lib/ai/schemas";

export type FurnitureKind = (typeof FLOORPLAN_FURNITURE_KINDS)[number];
export interface KitModel { w: number; d: number; ref_h: number }

export const FURNITURE_KIT: Record<FurnitureKind, KitModel> = {
  sofa: { w: 2.1, d: 0.9, ref_h: 0.8 },
  bed: { w: 1.54, d: 2.0, ref_h: 0.5 },
  table: { w: 1.2, d: 0.8, ref_h: 0.75 },
  chair: { w: 0.44, d: 0.46, ref_h: 0.9 },
  desk: { w: 1.2, d: 0.6, ref_h: 0.75 },
  wardrobe: { w: 1.0, d: 0.6, ref_h: 2.0 },
  cabinet: { w: 0.9, d: 0.45, ref_h: 0.9 },
  tv_stand: { w: 1.6, d: 0.42, ref_h: 0.5 },
  counter: { w: 1.8, d: 0.6, ref_h: 0.9 },
  toilet: { w: 0.4, d: 0.7, ref_h: 0.4 },
  bathtub: { w: 0.75, d: 1.6, ref_h: 0.6 },
  fan: { w: 0.4, d: 0.4, ref_h: 1.0 },
  computer: { w: 0.5, d: 0.22, ref_h: 0.45 },
  cup: { w: 0.08, d: 0.08, ref_h: 0.12 },
  vase: { w: 0.12, d: 0.12, ref_h: 0.35 },
  notebook: { w: 0.22, d: 0.16, ref_h: 0.03 },
  other: { w: 0.8, d: 0.5, ref_h: 0.8 },
};

export const kitUrl = (kind: string) => `/hq-floorplan/furniture/${kind in FURNITURE_KIT ? kind : "other"}.glb`;
export const FLOOR_TEXTURE = { color: "/hq-floorplan/textures/floor_oak.jpg", normal: "/hq-floorplan/textures/floor_oak_normal.jpg", tileM: 1.2 };

/** 把模型縮放成讀圖結果的尺寸（寬、高、深） */
export function kitScale(kind: string, size: { w: number; h: number; d: number }): [number, number, number] {
  const m = FURNITURE_KIT[(kind in FURNITURE_KIT ? kind : "other") as FurnitureKind];
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return [r(size.w / m.w), r(size.h / m.ref_h), r(size.d / m.d)];
}
