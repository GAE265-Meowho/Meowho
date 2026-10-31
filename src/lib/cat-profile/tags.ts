// 個性標籤、健康標籤的固定清單（GLOSSARY，#57）
// 個性標籤是暫定版，渝茜會依任務觸發條件在 #58 調整；改這裡就好，資料庫只存文字

export const PERSONALITY_TAGS = [
  "親人", "怕生", "黏人", "獨立", "活潑", "安靜",
  "愛玩", "貪吃", "膽小", "好奇", "愛叫", "親其他貓",
] as const;

// 醫療相關：畫面上要附「僅供參考，非醫療建議」（AGENTS.md §6）
export const HEALTH_TAGS = [
  "已結紮", "疫苗已完成", "已驅蟲", "FIV 陽性",
  "FeLV 陽性", "需每日用藥", "特殊飲食", "慢性病",
] as const;

export type PersonalityTag = (typeof PERSONALITY_TAGS)[number];
export type HealthTag = (typeof HEALTH_TAGS)[number];

/** AI 或使用者給的標籤只留清單內的，去重並依清單順序排列 */
export function pickTags<T extends string>(input: readonly string[], list: readonly T[]): T[] {
  const wanted = new Set(input.map((t) => t.trim()));
  return list.filter((t) => wanted.has(t));
}
