// 年齡層：依 AAFP／AAHA 2021 貓生命階段分四級（GLOSSARY「年齡層」，#57）
// 3D 體型只有三種（Tina #59），由年齡層推出；兩者不要混用

export type LifeStage = "kitten" | "young_adult" | "mature_adult" | "senior";
export type BodyType = "kitten" | "adult" | "senior";

/** maxMonths：未滿這個月齡屬於這一級；老貓沒有上限 */
export const LIFE_STAGES: { id: LifeStage; label: string; maxMonths: number | null }[] = [
  { id: "kitten", label: "幼貓", maxMonths: 12 },
  { id: "young_adult", label: "年輕成貓", maxMonths: 84 },
  { id: "mature_adult", label: "成熟成貓", maxMonths: 120 },
  { id: "senior", label: "老貓", maxMonths: null },
];

export const LIFE_STAGE_LABEL: Record<LifeStage, string> = Object.fromEntries(
  LIFE_STAGES.map((s) => [s.id, s.label]),
) as Record<LifeStage, string>;

/** 幼貓→幼貓體型；年輕成貓、成熟成貓→壯貓體型；老貓→老貓體型 */
export const BODY_TYPE_OF: Record<LifeStage, BodyType> = {
  kitten: "kitten",
  young_adult: "adult",
  mature_adult: "adult",
  senior: "senior",
};

export const BODY_TYPE_LABEL: Record<BodyType, string> = { kitten: "幼貓", adult: "壯貓", senior: "老貓" };

export function lifeStageOf(months: number | null): LifeStage | null {
  if (months === null) return null;
  return LIFE_STAGES.find((s) => s.maxMonths === null || months < s.maxMonths)!.id;
}

export const bodyTypeOf = (stage: LifeStage): BodyType => BODY_TYPE_OF[stage];
