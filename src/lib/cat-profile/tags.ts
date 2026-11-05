// 個性標籤、健康標籤的固定清單（GLOSSARY；照中途建貓流程設計稿 docs/design/new-cat-flow.html，#206）
// 以後標籤清單只以這個檔案為準（設計稿只是樣本）；改這裡就好，資料庫只存文字

/** 個性量表：四條兩端拉桿，1–5 格，3 是普通（參考巴克幫的性格量表） */
export const TRAITS = [
  { key: "energy", name: "活動量", left: "很懶、愛睡", right: "精力旺盛", words: ["很懶", "偏安靜", "普通", "偏好動", "超好動"] },
  { key: "bond", name: "跟人的距離", left: "獨立、不愛被打擾", right: "很黏、跟前跟後", words: ["很獨立", "偏獨立", "普通", "偏黏人", "超黏人"] },
  { key: "brave", name: "膽量", left: "膽小怕生、會躲", right: "大膽好奇、主動靠近", words: ["很膽小", "有點怕生", "普通", "偏大膽", "超大膽"] },
  { key: "adapt", name: "適應新環境", left: "要很久", right: "很快就自在", words: ["要很久", "偏慢熱", "普通", "偏快", "很快"] },
] as const;
export type TraitKey = (typeof TRAITS)[number]["key"];
/** 每條 1–5；null＝還沒選 */
export type PersonalityScale = Record<TraitKey, number | null>;
export const emptyScale = (): PersonalityScale => ({ energy: null, bond: null, brave: null, adapt: null });

/** 由量表自動產生的標籤（和試養遊戲 24e-adopt.js 的個性標籤一致）；「愛咬人」由小小壞習慣的咬人或抓人帶出 */
export const SCALE_TAGS = ["慵懶", "活潑", "獨立", "黏人", "膽小", "怕生", "親人", "慢熱", "適應力好", "愛咬人"] as const;
/** 中途可以自己加點的標籤 */
export const EXTRA_PERSONALITY_TAGS = ["貪吃", "好奇", "愛玩", "愛撒嬌", "愛被抱", "溫和", "有小脾氣", "怕寂寞", "會等門", "愛叫", "愛踏踏", "愛曬太陽"] as const;
export const PERSONALITY_TAGS = [...SCALE_TAGS, ...EXTRA_PERSONALITY_TAGS] as const;

// 醫療相關：畫面上要附「健康資訊僅供參考，非醫療建議」（AGENTS.md §6）
// 身體狀況；結紮、疫苗、驅蟲、FIV／FeLV、晶片改由 medical 顯示（lib/cat-profile/display.ts）
export const HEALTH_TAGS = [
  "慢性腎病", "口炎", "皮膚病", "視力不好", "聽力不好", "心臟病", "糖尿病", "泌尿道問題", "食物過敏", "以前骨折過", "每天吃藥",
] as const;
/** 試養遊戲已經有寫好劇情的健康標籤；其他標籤和中途自己填的身體狀況交給 AI 安排劇情（ai_story） */
export const GAME_HEALTH_TAGS: readonly HealthTag[] = ["慢性腎病", "口炎", "皮膚病", "每天吃藥"];

export type PersonalityTag = (typeof PERSONALITY_TAGS)[number];
export type HealthTag = (typeof HEALTH_TAGS)[number];

/** AI 或使用者給的標籤只留清單內的，去重並依清單順序排列 */
export function pickTags<T extends string>(input: readonly string[], list: readonly T[]): T[] {
  const wanted = new Set(input.map((t) => t.trim()));
  return list.filter((t) => wanted.has(t));
}

const SCALE_RULES: Record<TraitKey, (v: number) => PersonalityTag[]> = {
  energy: (v) => (v <= 2 ? ["慵懶"] : v >= 4 ? ["活潑"] : []),
  bond: (v) => (v <= 2 ? ["獨立"] : v >= 4 ? ["黏人"] : []),
  brave: (v) => (v === 1 ? ["膽小", "怕生"] : v === 2 ? ["怕生"] : v >= 4 ? ["親人"] : []),
  adapt: (v) => (v <= 2 ? ["慢熱"] : v >= 4 ? ["適應力好"] : []),
};

/**
 * 個性標籤（UT-03-07）：量表自動產生的＋中途加點的。同一條拉桿只會落在一側，所以不會同時出現「黏人」和「獨立」。
 * bites：小小壞習慣的「咬人或抓人」是偶爾或常常時加上「愛咬人」。中途加點的只留可以加點的那 12 個。
 */
export function personalityTags(scale: Partial<PersonalityScale>, extra: readonly string[] = [], bites = false): PersonalityTag[] {
  const out: PersonalityTag[] = [];
  for (const t of TRAITS) {
    const v = scale[t.key];
    if (typeof v === "number" && v >= 1 && v <= 5) out.push(...SCALE_RULES[t.key](v));
  }
  if (bites) out.push("愛咬人");
  out.push(...pickTags(extra, EXTRA_PERSONALITY_TAGS));
  return pickTags(out, PERSONALITY_TAGS);
}
