// 每天結束的儀式（#354，渝茜 2026-11-14）：一個節點結束、進下一個節點前，中途跳出來說「今天是第幾天」和接下來的任務。
// 規則模板（不用 LLM、不寫醫療建議、不寫金額）；〈貓名〉代入。結尾（farewell）前不跳，結局另有鋪陳。
import { STORY, type NodeId } from "./story";

export interface DayEnd {
  /** 今天（剛結束的節點時間標示），例如「第 1 天」 */
  today: string;
  /** 視窗標題：「今天是第 1 天」；「半年後」這類標示改成「五年後的這一天」 */
  title: string;
  /** 下一站，例如「第 3 天」 */
  next: string;
  /** 中途說的兩句：這一天的收尾、接下來的任務 */
  lines: [string, string];
}

/** 以「剛結束的節點」為 key；下一個節點是結尾的（year10）不放 */
const TEMPLATES: Partial<Record<NodeId, [string, string]>> = {
  day1: ["第一天辛苦了，〈貓名〉肯在新家待下來，就是好的開始。", "接下來幫牠把砂盆和碗擺好，再餵第一餐、清第一次砂盆。"],
  day3: ["〈貓名〉慢慢記住你的聲音了，你做得很好。", "接下來牠會越來越有精神，也是開始練習刷牙的好時機。"],
  day30: ["一個月了，〈貓名〉已經是家裡的一份子。", "接下來的日子會變成固定的節奏，吃喝、梳理都別漏掉。"],
  month8: ["半年一眨眼就過了，謝謝你一直陪著〈貓名〉。", "接下來牠會長成大貓，家裡的安全也要跟著再看一遍。"],
  year5: ["五年了，〈貓名〉一定很習慣有你在身邊。", "接下來牠會進入熟齡，要帶牠出門做一次健康檢查。"],
};

/** 剛結束第 nodeIndex 個節點時中途說的話；沒有下一個節點、或下一個是結尾時回傳 null */
export function dayEnd(nodeIndex: number, catName: string): DayEnd | null {
  const cur = STORY[nodeIndex];
  const next = STORY[nodeIndex + 1];
  if (!cur || !next || next.id === "farewell") return null;
  const t = TEMPLATES[cur.id];
  if (!t) return null;
  const fill = (x: string) => x.replaceAll("〈貓名〉", catName);
  return { today: cur.label, title: cur.label.startsWith("第") ? `今天是${cur.label}` : `${cur.label}的這一天`, next: next.label, lines: [fill(t[0]), fill(t[1])] };
}

/** 這次按「下一步」會不會結束這一天（照 flow.ts 的 next：在家的節點要等「在家的時光」結束；不在家的節點看完紀錄就走） */
export function endsDay(s: { step: string; nodeIndex: number; abandoned: boolean; cur: string | null }): boolean {
  if (s.step !== "node" || s.abandoned) return false;
  const node = STORY[s.nodeIndex];
  if (!node) return false;
  return s.cur === "home" || (s.cur === "log" && !node.home);
}
