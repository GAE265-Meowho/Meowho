// 年齡層：幼貓、壯貓、老貓三級（GLOSSARY「年齡層」，#109），直接等於 3D 體型（Tina #59）
// 中途大多不知道確切年紀，所以不記生日或月齡；聽到的年紀只用來決定是哪一級

export type LifeStage = "kitten" | "adult" | "senior";
export type BodyType = LifeStage;

/** maxMonths：未滿這個月齡屬於這一級；老貓沒有上限 */
export const LIFE_STAGES: { id: LifeStage; label: string; maxMonths: number | null }[] = [
  { id: "kitten", label: "幼貓", maxMonths: 12 },
  { id: "adult", label: "壯貓", maxMonths: 120 },
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
