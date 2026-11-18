// 虛擬飼養 DEMO（#237）：試養報告。照 catgame 原版（24k 的 fullReportHTML、fullMemoryHTML、fullAdvice；24c 的 EXP_CHECKS、expTrustWord）。
// 金額一律由 costs.ts／flow.ts 的公式算好，AI 只寫白話建議、不得產生數字（checkAdvice 會擋）。
// AI 建議（/api/play/advice）是加在原版規則建議之上的一段；AI 失敗時用 ruleAdvice（DEMO 的規則備案）。純函式。
import { z } from "zod";
import type { PlayerHome } from "./background";
import type { Hazard } from "./hazards";
import type { Life } from "./story";

/** 原版 DISCLAIMER（01-config） */
export const DISCLAIMER = "本作品提供之資訊僅供輔助參考，不能取代獸醫師之診斷、治療或專業建議。貓犬之健康與營養需求可能因個體狀況而異，如有健康疑慮或需要調整飲食與照護方式，請諮詢合格獸醫師。";
/** 業務規則要求的聲明（AGENTS.md §6），和原版 DISCLAIMER 一起顯示 */
export const HEALTH_NOTE = "僅供參考，非醫療建議。";

// 原版「收養之前，問問自己」6 題已併進「依你家的情況」（home-readiness.ts，渝茜 2026-11-18）

/** 原版 expTrustWord */
export const trustWord = (t: number) => (t >= 65 ? "很黏你" : t >= 45 ? "信任你" : t >= 25 ? "還在熟悉你" : "有點怕你");

/** 原版 EXP_MODES.kitten.outro */
export const OUTRO = "幼貓很可愛，但這份可愛會長成 15 年以上的責任。前幾個月養成的習慣，會決定牠老了以後過得好不好。";
/** 試養報告的結語：幼貓才講「幼貓很可愛」，大貓講陪伴的責任 */
export const outroFor = (startMonths: number) => startMonths < 12 ? OUTRO : "把一隻貓接回家，就是接下來每一年的責任。你們一起養成的習慣，會決定牠接下來過得好不好。";

/** 原版 fullMemoryHTML 的回憶：最後十件不是「可以再想想」的事 */
export function memoryMoments(X: Pick<Life, "picks" | "name">): string[] {
  const m = X.picks.filter(p => p.good !== false).slice(-10).map(p => p.t);
  return m.length ? m : [`你和${X.name}一起過的日子`];
}

/**
 * 原版 fullAdvice。DEMO 沒有作息題與序章問題，條件依手上的資料改寫：
 *   作息、出差（沒有問）→ 不出；急診預備金：沒存醫療預備金或動用過；房東：喵戶的住家狀況是租屋；過敏：DEMO 不問（不出）。
 */
export function fullAdvice(X: Pick<Life, "flags" | "care">): string[] {
  const A: string[] = [];
  // 急診預備金、房東、同住的人、寵物搬到「依你家的情況」（home-readiness.ts），這裡不再重複
  if (X.flags.scolded) A.push("貓在砂盆外尿尿時，先排除身體問題，再檢查貓砂、砂盆位置和乾淨程度。不要處罰。");
  if (!X.flags.brushDaily || X.care.teeth < 60) A.push("刷牙從幼貓期開始練最容易，每天幾分鐘就好。");
  if (!A.length) A.push("你的作息和準備都很不錯。實際收養前，再和中途聊聊這隻貓的習慣。");
  return A;
}

export interface AdviceContext {
  catName: string;
  home: PlayerHome;
  hazards: Hazard[];
  handled: string[];
  /** 每個情境的選擇（good：是不是建議的做法；null＝沒有對錯） */
  choices: { prompt: string; text: string; good: boolean | null; feedback: string }[];
  overBudget: boolean;
}

/** AI 建議的規則備案（DEMO）：依沒處理的危險、可以再想想的選擇、預算、同住的人 */
export function ruleAdvice(ctx: AdviceContext): string[] {
  const tips: string[] = [];
  const open = ctx.hazards.filter(h => !ctx.handled.includes(h.key));
  // newgame：試養報告不寫家裡的物件與位置，只說還有幾項
  // 居家安全建議由環境報告顯示，這裡只提醒要照報告處理
  if (open.length) tips.push("環境報告裡有幾項居家安全建議，接貓回家前先照報告處理好。");
  else tips.push("你的家目前沒有發現明顯的居家危險，接貓回家前還是再檢查一次。");
  const wrong = ctx.choices.filter(c => c.good === false);
  if (wrong.length) tips.push(`回頭想想「${wrong[0].text}」這個選擇，下次可以怎麼做。`);
  if (ctx.overBudget) tips.push("每月花費超過你的預算，建議先調整用品或預留一筆貓咪預備金。");
  // 同住的人、現有寵物的建議在「依你家的情況」（home-readiness.ts），這裡不再重複
  if (tips.length < 2) tips.push("實際收養前，再和中途聊聊這隻貓的個性、習慣和健康紀錄。");
  return tips.slice(0, 4);
}

/** AI 回傳的檢查：2～4 條、每條 4～90 字、不含數字 */
export function checkAdvice(raw: unknown): string[] | null {
  const r = z.object({
    tips: z.array(z.string().trim().min(4).max(90).refine(t => !/[0-9０-９]/.test(t))).min(2).max(4),
  }).safeParse(raw);
  return r.success ? r.data.tips : null;
}
