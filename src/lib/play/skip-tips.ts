// 跳過任務的提示（#456，渝茜）：在家的時光結束時，還沒做的照顧動作各說一句「長期不做可能引發什麼問題」。
// 規則模板（不用 LLM、不寫數字與金額）；醫療相關內容一律附「僅供參考，非醫療建議」（AGENTS.md 業務規則）。純函式。
import { CARE_ACTS, type CareAct } from "./care";

/** 長期沒做可能引發的問題（只講風險，不下診斷） */
export const SKIP_TIPS: Record<CareAct, string> = {
  scoop: "砂盆太髒，貓可能憋尿，增加泌尿道發炎的風險。",
  water: "喝水太少，尿液變濃，容易有泌尿道結石或膀胱炎的風險。",
  feed: "吃得太少或不固定，貓可能掉體重、沒精神，嚴重時會傷到肝臟。",
  brush: "牙菌斑累積，可能變成牙結石、牙齦炎和口臭。",
  nail: "指甲太長可能勾到布料，或長進肉墊造成發炎。",
  pet: "太少互動，貓可能比較不信任你，壓力變高。",
  play: "沒有運動，容易變胖、無聊，壓力慢慢累積。",
};

/** 競賽規定的獸醫聲明 */
export const VET_NOTICE = "僅供參考，非醫療建議；貓咪有不舒服請諮詢獸醫師。";

/** 影響比較大的排前面（視窗不能捲動，一次最多講 MAX_TIPS 項） */
const PRIORITY: readonly CareAct[] = ["scoop", "water", "feed", "brush", "nail", "pet", "play"];
export const MAX_TIPS = 3;

/** 這一輪在家的時光沒做的動作：做過（成功或試過）的不算 */
export function skippedActs(done: readonly CareAct[], tried: readonly CareAct[]): CareAct[] {
  return CARE_ACTS.map(c => c.act).filter(a => !done.includes(a) && !tried.includes(a));
}

export interface SkipTips {
  items: { act: CareAct; label: string; tip: string }[];
  /** 沒列出來的還有幾項 */
  more: number;
}

/** 要顯示的提示；沒有跳過任何動作回 null */
export function skipTips(skipped: readonly CareAct[]): SkipTips | null {
  if (!skipped.length) return null;
  const sorted = PRIORITY.filter(a => skipped.includes(a));
  const label = (a: CareAct) => CARE_ACTS.find(c => c.act === a)?.label ?? a;
  return { items: sorted.slice(0, MAX_TIPS).map(a => ({ act: a, label: label(a), tip: SKIP_TIPS[a] })), more: Math.max(0, sorted.length - MAX_TIPS) };
}
