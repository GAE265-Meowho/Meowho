// 虛擬飼養 DEMO（#237）：每個節點加寫一段個人化台詞（依玩家背景與房間家具）。
// AI（Azure）寫的版本要過 checkLines：段落數、說話的人只能是清單裡的、每句長度、不含數字（AI 不產生數字）。
// AI 沒設定、失敗、逾時（LINES_TIMEOUT_MS）或沒通過檢查時，用 ruleLines 規則產生，玩家不用等。純函式。
import { z } from "zod";
import type { PlayerHome } from "./background";
import type { Places } from "./room";
import type { Line, NodeId } from "./story";

export const LINES_TIMEOUT_MS = 8_000;
export const LINE_MAX_CHARS = 80;

export interface LinesContext {
  nodeId: NodeId;
  catName: string;
  home: PlayerHome;
  /** 房間物品清單 */
  labels: string[];
  places: Places;
}

/** 可以說話的人：旁白、你、貓、同住的人、原有的寵物 */
export function allowedSpeakers(ctx: Pick<LinesContext, "catName" | "home">): string[] {
  return ["旁白", "你", ctx.catName, ...ctx.home.family, ...ctx.home.pets.map(p => `家裡的${p}`)];
}

const N = "旁白";
const has = (xs: string[], word: string) => xs.some(x => x.includes(word));

/** 規則產生的個人化台詞 */
export function ruleLines(ctx: LinesContext): Line[] {
  const { catName: c, home, places } = ctx;
  const fam = home.family;
  const out: Line[] = [];
  if (ctx.nodeId === "first-day") {
    if (has(home.pets, "狗")) out.push({ speaker: "家裡的狗", text: `家裡的狗聞到新味道，在房門口走來走去。你先把牠們隔開，讓兩邊從交換氣味開始認識。` });
    else if (has(home.pets, "貓")) out.push({ speaker: N, text: `原本的貓隔著門低吼了一聲。你決定先讓${c}待在這個房間，等兩隻都習慣彼此的味道再見面。` });
    if (has(fam, "小孩")) out.push({ speaker: "小孩", text: `「牠好小喔！」小孩蹲在旁邊，你提醒他小聲一點，等${c}自己走過來。` });
    else if (fam.length) out.push({ speaker: fam[0], text: `${fam[0]}探頭看了看${places.hide}：「牠會不會一直都不出來？」你說：「給牠一點時間。」` });
    else out.push({ speaker: N, text: `${home.dwelling}的晚上很安靜，只有你和${c}。你把燈調暗一點，讓牠安心。` });
  } else if (ctx.nodeId === "five-years") {
    if (has(fam, "長輩")) out.push({ speaker: "長輩", text: `長輩每天早上都會跟${c}說早安，牠也會跑過去蹭蹭腳。` });
    else if (fam.length) out.push({ speaker: fam[0], text: `「${c}今天又霸佔${places.sofa}了。」${fam[0]}笑著說，乖乖坐到旁邊。` });
    if (home.pets.length) out.push({ speaker: N, text: `五年下來，${c}和家裡的${home.pets[0]}已經會一起曬太陽了。` });
    if (!out.length) out.push({ speaker: N, text: `你下班一打開門，${c}就在玄關等你。這是五年來每天的習慣。` });
  } else {
    if (fam.length) out.push({ speaker: fam[0], text: `${fam[0]}輕輕摸著${c}的背：「謝謝你陪我們這麼久。」` });
    if (home.pets.length) out.push({ speaker: N, text: `家裡的${home.pets[0]}安靜地趴在不遠處，好像也知道發生了什麼事。` });
    if (!out.length) out.push({ speaker: N, text: `你想起在${home.dwelling}的每一個晚上，${c}都睡在你腳邊。` });
  }
  return out.slice(0, 3);
}

/** AI 回傳的檢查：1～4 句、說話的人在清單裡、每句 2～80 字、不含數字 */
export function checkLines(raw: unknown, ctx: Pick<LinesContext, "catName" | "home">): Line[] | null {
  const speakers = allowedSpeakers(ctx);
  const schema = z.object({
    lines: z.array(z.object({
      speaker: z.string().trim().refine(s => speakers.includes(s)),
      text: z.string().trim().min(2).max(LINE_MAX_CHARS).refine(t => !/[0-9０-９]/.test(t)),
    })).min(1).max(4),
  });
  const r = schema.safeParse(raw);
  return r.success ? r.data.lines : null;
}
