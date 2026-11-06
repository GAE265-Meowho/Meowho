// 虛擬飼養 DEMO（#237）：試養報告的建議。AI 寫（Azure），沒設定、失敗或沒通過檢查時用 ruleAdvice 規則產生。
// 金額一律由 costs.ts 的公式算好顯示在報告上，AI 只寫白話建議、不得產生數字（checkAdvice 會擋）。純函式。
import { z } from "zod";
import type { PlayerHome } from "./background";
import type { Hazard } from "./hazards";

export interface AdviceContext {
  catName: string;
  home: PlayerHome;
  hazards: Hazard[];
  handled: string[];
  /** 每個情境的選擇（good：是不是建議的做法） */
  choices: { prompt: string; text: string; good: boolean; feedback: string }[];
  overBudget: boolean;
}

export function ruleAdvice(ctx: AdviceContext): string[] {
  const tips: string[] = [];
  const open = ctx.hazards.filter(h => !ctx.handled.includes(h.key));
  if (open.length) tips.push(`家裡還有「${open.slice(0, 2).map(h => h.label).join("、")}」沒處理，接貓回家前先照建議處理好。`);
  else tips.push("家裡的危險你都先處理了，這是接貓回家最重要的準備。");
  const wrong = ctx.choices.filter(c => !c.good);
  if (wrong.length) tips.push(`回頭看看「${wrong[0].prompt || "這一段"}」的建議：${wrong[0].feedback}`);
  else tips.push("每個情境你都選了對貓友善的做法，接下來可以多認識這隻貓的個性。");
  if (ctx.overBudget) tips.push("每月花費超過你的預算，建議先調整用品或預留一筆貓咪預備金。");
  else tips.push("預留一筆貓咪預備金給健康檢查和意外，比較不會手忙腳亂。");
  if (ctx.home.pets.length) tips.push(`家裡已經有${ctx.home.pets.join("、")}，接貓回家後先分開住幾天，從交換氣味開始認識。`);
  else if (ctx.home.family.length) tips.push(`和${ctx.home.family.join("、")}先說好餵食、鏟砂由誰負責，照顧才不會漏掉。`);
  return tips.slice(0, 4);
}

/** AI 回傳的檢查：2～4 條、每條 4～90 字、不含數字 */
export function checkAdvice(raw: unknown): string[] | null {
  const r = z.object({
    tips: z.array(z.string().trim().min(4).max(90).refine(t => !/[0-9０-９]/.test(t))).min(2).max(4),
  }).safeParse(raw);
  return r.success ? r.data.tips : null;
}
