// 試養報告「依你家的情況」（#354，渝茜 2026-11-18）：從喵戶資料看的 6 格＋只有自己知道的「問問自己」5 格。
// 原本報告最後的「收養之前，問問自己」6 題併進來：第 1 題（房東、家人都同意）併進「房東／住家」「同住的人」，
// 第 2 題（急診 2～3 萬）和其他 4 題變成「問問自己」。原本「給你的建議」裡講房東、同住的人、寵物的句子也搬來這裡，不再重複。
// 純函式；文字照渝茜確認的示範（第 4 版）。過敏是健康資訊，只在這份報告給本人看，不放進給中途的報告（report-payload.ts）。
import { type Allergy, EXPERIENCE, LANDLORD } from "@/lib/onboarding/household-rules";
import type { PlayerHome } from "./background";
import { money } from "./costs";

export type Status = "ok" | "warn" | "bad";
/** 「問問自己」還沒打勾 */
export type AskStatus = Status | "ask";

export const STATUS_LABEL: Record<Status, string> = { ok: "沒問題", warn: "要準備", bad: "先處理" };

export interface HomeTile {
  key: "housing" | "family" | "allergy" | "pets" | "exp" | "budget";
  /** 格子上的小標（房東、同住的人…） */
  label: string;
  /** 格子上的大字（一句重點） */
  value: string;
  status: Status;
  /** 點格子後下面出現的建議 */
  title: string;
  body: string[];
  /** 「建議：」那一行 */
  act?: string;
  /** 待辦清單（養貓經驗） */
  todo?: { head: string; text: string }[];
  /** 同住的人：頭像文字 */
  people?: string[];
  /** 預算：花費／預算的比例（0～1，超過算 1） */
  ratio?: number;
}

export interface SelfCheck {
  key: "fund" | "time" | "help" | "life" | "old";
  label: string;
  value: string;
  title: string;
  body: string;
}

/** 報告需要的喵戶資料：home（公開的那份）＋私密表的過敏與預算 */
export interface ReadinessInput {
  home: PlayerHome;
  allergy: Allergy | null;
  /** 每月預算；0 或沒填當作沒有 */
  budget: number;
  /** 試養算出的每月花費 */
  monthly: number;
  catName: string;
  /** 這次試養有沒有走到第 30 天半夜跑酷 */
  zoomies: boolean;
}

/** 第一次養貓：遊戲裡沒演到、但要先準備的事（渝茜 2026-11-18：上網查常見清單，生病訊號要具體） */
export const FIRST_CAT_TODO: { head: string; text: string }[] = [
  { head: "晶片和寵物登記", text: "2026 年起家貓一定要登記，沒登記會被罰款。從中途接回來後，要把登記改成你的名字。" },
  { head: "接回家一週內先健檢", text: "一般會做身體檢查、糞便寄生蟲檢查，以及貓愛滋、白血病篩檢；疫苗照醫師排的時間打。" },
  { head: "先找好醫院", text: "家附近一家，再記一家 24 小時急診的電話。" },
  { head: "這三種情況要馬上看醫生", text: "超過 24 小時完全不吃（貓很容易因此得脂肪肝）；一直蹲貓砂盆，卻尿不太出來（公貓尤其危險，可能是尿道塞住）；張著嘴呼吸（貓不像狗會喘氣）。" },
];

export const SELF_CHECKS: SelfCheck[] = [
  { key: "fund", label: "急診預備金", value: "能一次拿出 2～3 萬元嗎", title: "急診預備金", body: "貓生病常常是突然的，急診和住院一次就可能花 2～3 萬元。這筆錢最好另外存，不算在每月預算裡。" },
  { key: "time", label: "每天的時間", value: "每天 30～60 分鐘照顧、陪玩", title: "每天的時間", body: "餵飯、換水、鏟屎、陪玩，每天大約 30～60 分鐘。下面的「每天有沒有做到」可以看你這次試養的情況。" },
  { key: "help", label: "有人幫忙", value: "出差、旅行、生病時有人照顧牠", title: "有人幫忙照顧", body: "出差、旅行或自己生病時，要有可靠的人能來餵飯、鏟砂，或先找好寵物保母、貓旅館。" },
  { key: "life", label: "人生的變化", value: "交往、結婚、生小孩、搬家都帶著牠", title: "人生的變化", body: "交往、結婚、生小孩、搬家，都要把牠一起規劃進去，而不是到時候再送走。" },
  { key: "old", label: "陪牠到老", value: "牠老了、生病了，陪牠走到最後", title: "陪牠到老", body: "熟齡貓要更常看醫生，花費也會變多。試養的最後你已經陪牠走過一次。" },
];

/** 「問問自己」：這次試養沒存醫療預備金或動用過，急診預備金那格多一句（原本「給你的建議」第一條搬來） */
export function selfChecks(fundShort: boolean): SelfCheck[] {
  return SELF_CHECKS.map(c => (c.key === "fund" && fundShort ? { ...c, body: `${c.body}這次試養你沒有存醫療預備金，或已經動用過。` } : c));
}

function housing(h: PlayerHome): HomeTile {
  if (h.living !== "租屋") {
    return { key: "housing", label: "住家", value: h.living, status: "ok", title: `住家：${h.living}`,
      body: ["貓可以活 15 年以上。想想未來搬家時，新家也能養貓。"] };
  }
  const l = h.landlord;
  if (l === LANDLORD.yes) return { key: "housing", label: "房東", value: "已同意養貓", status: "ok", title: "房東已同意養貓",
    body: ["貓可以活 15 年以上。把「可以養貓」寫進租約，換房東、續約或搬家時才有依據。"] };
  if (l === LANDLORD.no) return { key: "housing", label: "房東", value: "不同意養貓", status: "bad", title: "房東不同意養貓",
    body: ["房東不同意時接貓回家，之後很可能被迫送走牠。先和房東談好、寫進租約，或等搬到能養貓的地方。"] };
  return { key: "housing", label: "房東", value: l === LANDLORD.asking ? "還在問" : "還沒問", status: "warn", title: "房東還沒同意",
    body: ["接貓回家前，先確定房東同意，而且是未來幾年都能養。"], act: "談好後把「可以養貓」寫進租約" };
}

function family(h: PlayerHome, catName: string, zoomies: boolean): HomeTile {
  const people = h.family;
  if (!people.length) return { key: "family", label: "同住的人", value: "自己住", status: "ok", title: "自己住",
    body: ["一個人照顧，出差、旅行或生病時更要先找好幫手（見下面「問問自己」）。"] };
  const has = (x: string) => people.includes(x);
  const body = ["接回家前，要每個同住的人都同意，而且是未來 15 年都同意。"];
  if (has("小孩")) body.push("教小孩用手掌輕摸、不要抱著追；家裡要有小孩碰不到、貓可以躲的地方。");
  if (has("長輩")) body.push(zoomies ? `這次試養${catName}在第 30 天半夜跑酷，長輩夜裡起床要注意腳邊。` : "長輩夜裡起床要注意腳邊，貓常在腳邊鑽來鑽去。");
  if (has("室友")) body.push("先和室友說好：誰搬走或你搬家時，貓跟誰。");
  const warn = has("小孩") || has("長輩") || has("室友");
  const pick = has("長輩") ? "有長輩同住" : has("小孩") ? "有小孩同住" : has("室友") ? "有室友同住" : `和${people.join("、")}同住`;
  return { key: "family", label: "同住的人", value: pick, status: warn ? "warn" : "ok", title: pick, body, people,
    act: `夜裡留一盞燈，先說好誰餵飯、誰鏟砂` };
}

function allergy(a: Allergy | null): HomeTile {
  const base = { key: "allergy" as const, label: "過敏" };
  if (a === "none") return { ...base, value: "沒有人過敏", status: "ok", title: "沒有人對貓過敏", body: ["很好。之後有新的家人或室友搬進來，也要先問一下。"] };
  if (a === "severe") return { ...base, value: "有人症狀明顯", status: "bad", title: "有人對貓過敏，症狀明顯",
    body: ["過敏是很常見的棄養原因。先到中途家和貓相處幾個小時看看反應，也請醫師評估。"], act: "臥室不讓貓進去，準備空氣清淨機" };
  if (a === "mild") return { ...base, value: "有人症狀輕微", status: "warn", title: "有人對貓過敏，症狀輕微",
    body: ["症狀可能隨相處時間變嚴重。先到中途家和貓相處幾個小時看看反應，也請醫師評估。"], act: "臥室不讓貓進去，常清潔、勤洗手" };
  if (a === "unsure") return { ...base, value: "不確定", status: "warn", title: "不確定會不會過敏",
    body: ["還沒和貓長時間相處過的人，可能接回家才發現過敏。先到中途家和貓相處幾個小時看看反應。"] };
  return { ...base, value: "還沒填", status: "warn", title: "還沒填過敏",
    body: ["到「修改喵戶」回答「你或同住的人對貓過敏嗎」，這裡就會給你建議。"] };
}

function pets(h: PlayerHome): HomeTile {
  const p = h.pets;
  if (!p.length) return { key: "pets", label: "其他寵物", value: "沒有", status: "ok", title: "家裡沒有其他寵物", body: ["不用隔離適應，牠可以直接熟悉整個家。"] };
  const body: string[] = [];
  if (p.includes("貓") || p.includes("狗")) body.push("接回家後先分開住幾天，從交換氣味開始認識，再慢慢見面。");
  const small = p.filter(x => x !== "貓" && x !== "狗");
  if (small.length) body.push(`${small.join("、")}要放在貓碰不到的地方，籠子要關緊。`);
  return { key: "pets", label: "其他寵物", value: `家裡有${p.join("、")}`, status: "warn", title: `家裡有${p.join("、")}`, body };
}

function experience(h: PlayerHome): HomeTile {
  const e = h.experience;
  if (e === EXPERIENCE.long) return { key: "exp", label: "養貓經驗", value: "養過 3 年以上", status: "ok", title: "養過 3 年以上",
    body: ["你的經驗很夠。每隻貓個性差很多，接回家前先和中途聊聊這隻貓的習慣。"] };
  if (e === EXPERIENCE.some) return { key: "exp", label: "養貓經驗", value: "養過，不到 3 年", status: "ok", title: "養過，不到 3 年：再複習一次",
    body: ["接新的貓回家，這兩件事一樣要先做："], todo: FIRST_CAT_TODO.filter(t => t.head !== "先找好醫院") };
  return { key: "exp", label: "養貓經驗", value: `第一次養：${FIRST_CAT_TODO.length} 件事先準備`, status: "warn",
    title: "第一次養貓：遊戲裡沒演到、但要先準備的事", body: [], todo: FIRST_CAT_TODO };
}

function budgetTile(budget: number, monthly: number): HomeTile {
  const base = { key: "budget" as const, label: "每月預算" };
  if (!budget) return { ...base, value: "還沒填", status: "warn", title: "還沒填每月預算", body: [`試養算出每月約 ${money(monthly)} 元。到「修改喵戶」填預算，這裡就能幫你比較。`] };
  const over = monthly > budget;
  return {
    ...base, value: `花費 ${money(monthly)}／預算 ${money(budget)}`, status: over ? "bad" : "ok", ratio: Math.min(1, monthly / budget),
    title: over ? "每月花費超出預算" : "每月預算夠用",
    body: [over ? `試養算出每月約 ${money(monthly)} 元，超出你的預算 ${money(budget)} 元。先調整用品，或提高預算。` : `試養算出每月約 ${money(monthly)} 元，在你的預算 ${money(budget)} 元以內。另外還要一筆急診預備金，見下面「問問自己」。`],
  };
}

/** 從喵戶資料看的 6 格（順序固定：房東／住家、同住的人、過敏、其他寵物、養貓經驗、每月預算） */
export function homeTiles(i: ReadinessInput): HomeTile[] {
  return [housing(i.home), family(i.home, i.catName, i.zoomies), allergy(i.allergy), pets(i.home), experience(i.home), budgetTile(i.budget, i.monthly)];
}

/** 最上面的數量與色條：沒問題、要準備、先處理、還沒打勾 */
export function readinessCounts(tiles: Pick<HomeTile, "status">[], checked: boolean[]) {
  const all: AskStatus[] = [...tiles.map(t => t.status), ...checked.map(c => (c ? "ok" : "ask") as AskStatus)];
  const n = (k: AskStatus) => all.filter(x => x === k).length;
  const order: Record<AskStatus, number> = { bad: 0, warn: 1, ask: 2, ok: 3 };
  return { ok: n("ok"), warn: n("warn"), bad: n("bad"), ask: n("ask"), bar: [...all].sort((a, b) => order[a] - order[b]) };
}
