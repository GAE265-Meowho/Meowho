// 年齡層：幼貓、成貓、老貓三級（GLOSSARY「年齡層」，#109；分界與名稱照設計稿 #206），直接等於 3D 體型（Tina #59）
// 幼貓未滿 7 個月、成貓 7 個月到未滿 10 歲、老貓 10 歲以上。中途說的大約年紀存成月齡，名片顯示「幼貓（約 3 個月）」

export type LifeStage = "kitten" | "adult" | "senior";
export type BodyType = LifeStage;

/** maxMonths：未滿這個月齡屬於這一級；老貓沒有上限 */
export const LIFE_STAGES: { id: LifeStage; label: string; maxMonths: number | null }[] = [
  { id: "kitten", label: "幼貓", maxMonths: 7 },
  { id: "adult", label: "成貓", maxMonths: 120 },
  { id: "senior", label: "老貓", maxMonths: null },
];

export const LIFE_STAGE_LABEL: Record<LifeStage, string> = Object.fromEntries(
  LIFE_STAGES.map((s) => [s.id, s.label]),
) as Record<LifeStage, string>;

export const BODY_TYPE_OF: Record<LifeStage, BodyType> = { kitten: "kitten", adult: "adult", senior: "senior" };
export const BODY_TYPE_LABEL: Record<BodyType, string> = LIFE_STAGE_LABEL;

export function lifeStageOf(months: number | null): LifeStage | null {
  if (months === null) return null;
  return LIFE_STAGES.find((s) => s.maxMonths === null || months < s.maxMonths)!.id;
}

const WORDS: [LifeStage, RegExp][] = [
  ["kitten", /剛滿月|小貓|幼貓|奶貓|小小貓/],
  ["senior", /老貓|老人貓|高齡/],
  ["adult", /成貓|壯貓|成年/],
];

/** 沒講數字、直接講「小貓」「老貓」時用 */
export const lifeStageFromWords = (text: string): LifeStage | null => WORDS.find(([, re]) => re.test(text))?.[0] ?? null;

export const bodyTypeOf = (stage: LifeStage): BodyType => BODY_TYPE_OF[stage];

/** 大約年紀：未滿 1 歲用月、滿 1 歲用歲（整數，無條件捨去） */
export function approxAge(months: number | null): string | null {
  if (months === null || !Number.isFinite(months) || months < 0) return null;
  return months < 12 ? `約 ${Math.max(1, Math.round(months))} 個月` : `約 ${Math.floor(months / 12)} 歲`;
}

/** 名片上的年紀：「幼貓（約 3 個月）」；沒有月齡就只顯示年齡層 */
export function ageLabel(stage: LifeStage | null, months: number | null): string {
  const age = approxAge(months);
  const label = stage ? LIFE_STAGE_LABEL[stage] : "";
  return label && age ? `${label}（${age}）` : label || age || "";
}
