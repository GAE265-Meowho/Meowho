// 中途新增送養貓（設計稿 docs/design/new-cat-flow.html，#206）：必填檢查、照片與封面。畫面在 PR 2 接上。
// 照片：正面、側面、背面三張給 3D 流程用（側面必填＝AI 三視角的上色照），存 meow_cats.photo_angles；生活照最多 6 張存 photo_paths。

import type { LifeStage } from "./life-stage";

export const ANGLE_KEYS = ["front", "left", "back"] as const;
export type AngleKey = (typeof ANGLE_KEYS)[number];
export const ANGLE_NAME: Record<AngleKey, string> = { front: "正面", left: "側面", back: "背面" };
/** 三張角度照的儲存路徑；null＝還沒拍 */
export type PhotoAngles = Record<AngleKey, string | null>;
export const emptyAngles = (): PhotoAngles => ({ front: null, left: null, back: null });

/** 生活照上限（資料庫 0024 的 meow_cats_photo_paths_check 同樣是 6） */
export const MAX_LIFE_PHOTOS = 6;

export interface NewCatRequired { name: string; lifeStage: LifeStage | null; angles: PhotoAngles; consent: boolean }

/**
 * UT-02-07：必填只有名字、年齡（存成年齡層）、正面／側面／背面三張照片（建 3D 模型至少要三張，子哲 2026-11-05）、同意授權；
 * 回傳還沒填的（畫面顯示「還沒填：…」）。修改既有的貓（angles: false）不要求角度照：0024 以前的貓沒有另外存角度照。
 */
export function newCatMissing(d: NewCatRequired, opts: { angles?: boolean } = {}): string[] {
  const angles = opts.angles ?? true;
  return [
    !d.name.trim() && "名字",
    !d.lifeStage && "大概幾歲",
    ...(angles ? ANGLE_KEYS.filter(k => !d.angles[k]).map(k => `${ANGLE_NAME[k]}照片`) : []),
    !d.consent && "同意授權",
  ].filter((x): x is string => Boolean(x));
}

/** 拍照這一步還差哪幾張角度照 */
export const anglesMissing = (angles: PhotoAngles) => ANGLE_KEYS.filter(k => !angles[k]).map(k => `${ANGLE_NAME[k]}照片`);

/** 封面：a:正面／a:側面／a:背面，或 o:生活照第幾張（從 0 開始）；null＝用預設那張 */
export type Cover = `a:${AngleKey}` | `o:${number}` | null;

/** 實際顯示的封面路徑：中途選的那張；沒選或那張不在了就用預設（生活照第一張 → 正面 → 側面 → 背面） */
export function coverPath(cover: Cover, angles: PhotoAngles, others: readonly string[]): string | null {
  if (cover?.startsWith("a:")) {
    const p = angles[cover.slice(2) as AngleKey];
    if (p) return p;
  } else if (cover?.startsWith("o:")) {
    const p = others[Number(cover.slice(2))];
    if (p) return p;
  }
  return others[0] ?? angles.front ?? angles.left ?? angles.back ?? null;
}

/** UT-03-08：刪掉第 i 張生活照後的封面。刪的是封面那張 → 改回預設；刪的在前面 → 封面的序號往前移 */
export function coverAfterRemoveOther(cover: Cover, index: number): Cover {
  if (!cover?.startsWith("o:")) return cover;
  const c = Number(cover.slice(2));
  return c === index ? null : c > index ? `o:${c - 1}` : cover;
}

/** 刪掉（或重拍）某個角度的照片後的封面：刪的是封面那張就改回預設 */
export const coverAfterRemoveAngle = (cover: Cover, angle: AngleKey): Cover => (cover === `a:${angle}` ? null : cover);
