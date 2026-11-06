// 虛擬飼養 DEMO（#237）：整場唯一一次居家意外，固定在節點 2「五年後」。
// 從 AI（或規則）辨認出、而玩家「沒有處理」的危險裡挑一件；全部都處理了就改成一件小狀況（毛球嘔吐或經濟吃緊），
// 並在劇情裡肯定玩家的準備。節點 1、3 一律沒有事件。
// 描述點到為止（咬電線、嘔吐不做驚嚇畫面）；健康相關只提醒觀察與就醫，不寫診斷或治療。金額是 DEMO 估算常數。
import type { Hazard } from "./hazards";
import type { Beat, NodeId } from "./story";

export const EVENT_NODE: NodeId = "five-years";

export type NodeEvent =
  | { kind: "accident"; hazard: Hazard; beat: Beat }
  | { kind: "minor"; key: "hairball" | "budget"; beat: Beat };

const N = "旁白";
const YOU = "你";
const VET_NOTE = "有任何不對勁，先打電話問動物醫院，不要自己餵人吃的藥。";

const ACCIDENTS: Record<string, Omit<Beat, "id" | "event">> = {
  cable: {
    action: "explore", health: true,
    lines: [
      { speaker: N, text: "你在廚房洗碗，聽到客廳傳來「喀」的一聲。{name}正低頭咬著電腦後面的電線。" },
      { speaker: YOU, text: "（之前一直想買集線盒，還沒買……）" },
    ],
    prompt: "你會？",
    options: [
      { text: "先關掉電源、拔掉插頭，再把牠抱開，檢查嘴巴；有異狀馬上打給動物醫院", good: true, feedback: "先斷電再靠近最安全。之後把電線收好，從源頭降低風險。" + VET_NOTE, cost: { category: "accident", amount: 1500 } },
      { text: "大聲罵牠，把電線拉走", good: false, feedback: "拉扯電線反而更危險；先斷電，再把電線收進集線盒。", cost: { category: "accident", amount: 1500 } },
    ],
  },
  cup: {
    action: "high",
    lines: [
      { speaker: N, text: "{name}跳上桌子，用前腳輕輕一撥——〈桌上小物〉翻倒了，水流了一桌，還滴到旁邊的延長線。" },
    ],
    prompt: "你會？",
    options: [
      { text: "先拔掉電源再擦乾，之後杯子改放到貓碰不到的地方", good: true, feedback: "水和電放在一起是最常見的居家風險，先斷電再收拾。", cost: { category: "accident", amount: 800 } },
      { text: "趕快拿抹布擦，邊擦邊罵牠", good: false, feedback: "撥東西是貓的天性，與其罵牠，不如把會倒的東西收好。", cost: { category: "accident", amount: 800 } },
    ],
  },
  window: {
    action: "high",
    lines: [
      { speaker: N, text: "你開窗通風，一轉身，{name}已經站在窗台上，用頭頂著紗窗往外看。" },
    ],
    prompt: "你會？",
    options: [
      { text: "慢慢走過去抱牠下來，關窗，週末就去裝防墜紗窗", good: true, feedback: "貓墜樓多半發生在一瞬間，防墜紗窗或窗戶限位器能大幅降低風險。", cost: { category: "accident", amount: 2400 } },
      { text: "大叫牠的名字叫牠下來", good: false, feedback: "突然的大聲可能讓牠受驚往外跳，慢慢靠近最安全。", cost: { category: "accident", amount: 2400 } },
    ],
  },
  plant: {
    action: "explore", health: true,
    lines: [
      { speaker: N, text: "早上起床，花瓶倒在地上，{name}正在咬花瓶裡的葉子。" },
    ],
    prompt: "你會？",
    options: [
      { text: "先把植物收走，拍下植物的樣子，打電話問動物醫院要不要帶去看", good: true, feedback: "不確定植物安不安全時，先問醫師最可靠。" + VET_NOTE, cost: { category: "accident", amount: 1200 } },
      { text: "牠看起來沒事，先觀察就好", good: false, feedback: "有些植物對貓不安全，不確定時要先問醫師，不要等。", cost: { category: "accident", amount: 1200 } },
    ],
  },
  door: {
    action: "explore",
    lines: [
      { speaker: N, text: "你提著大包小包回家，門一開，{name}從你腳邊一溜煙衝到樓梯間。" },
    ],
    prompt: "你會？",
    options: [
      { text: "放下東西、蹲低慢慢靠近，用零食把牠引回來；之後在玄關加隔離門", good: true, feedback: "追牠會讓牠跑得更遠。隔離門能降低下一次衝出去的機會。", cost: { category: "accident", amount: 1800 } },
      { text: "衝過去抓牠", good: false, feedback: "被追的貓會更慌張，先讓牠冷靜下來。", cost: { category: "accident", amount: 1800 } },
    ],
  },
};

/** 沒有專屬劇情的危險（AI 額外辨認出的項目） */
function genericAccident(h: Hazard): Omit<Beat, "id" | "event"> {
  return {
    action: "explore",
    lines: [{ speaker: N, text: `你發現{name}對「${h.label}」很有興趣，正想靠近。之前辨認出來的這個風險，你還沒有處理。` }],
    prompt: "你會？",
    options: [
      { text: "先把牠帶開，今天就照建議處理", good: true, feedback: h.advice, cost: { category: "accident", amount: 1000 } },
      { text: "應該沒關係，下次再說", good: false, feedback: `風險還在，建議：${h.advice}`, cost: { category: "accident", amount: 1000 } },
    ],
  };
}

const MINOR: Record<"hairball" | "budget", Omit<Beat, "id" | "event">> = {
  hairball: {
    action: "idle", health: true,
    lines: [
      { speaker: N, text: "因為你一開始就把家裡的危險都處理好了，這五年{name}幾乎沒遇過什麼意外。" },
      { speaker: N, text: "今天早上，牠在地上吐了一小團毛球，吐完又去吃飯了。" },
    ],
    prompt: "你會？",
    options: [
      { text: "清乾淨、記下日期，多幫牠梳毛；如果常常吐或精神變差就帶去看醫生", good: true, feedback: "偶爾吐毛球很常見，記錄次數能幫醫師判斷。" },
      { text: "給牠吃人吃的胃藥", good: false, feedback: "人的藥可能對貓有害，不要自己餵藥。" },
    ],
  },
  budget: {
    action: "sofa",
    lines: [
      { speaker: N, text: "因為你一開始就把家裡的危險都處理好了，這五年{name}過得很平安。" },
      { speaker: N, text: "只是這個月手頭比較緊，貓砂和飼料又剛好同時要補貨。" },
    ],
    prompt: "你會？",
    options: [
      { text: "先改買小包裝，健康檢查和飼料品質不省", good: true, feedback: "預留一筆貓咪預備金，緊的時候比較不慌。" },
      { text: "換成來路不明、最便宜的飼料", good: false, feedback: "突然換飼料容易讓腸胃不適應，省錢也要循序漸進。" },
    ],
  },
};

const ORDER = { high: 0, medium: 1, low: 2 } as const;

/**
 * 這個節點要不要插事件：只有 EVENT_NODE 會回傳事件。
 * 未處理的危險優先挑等級高的，同等級用 rand 挑；全部處理完挑一件小狀況。
 */
export function pickNodeEvent(nodeId: NodeId, hazards: Hazard[], handled: string[], rand: () => number = Math.random): NodeEvent | null {
  if (nodeId !== EVENT_NODE) return null;
  const open = hazards.filter(h => !handled.includes(h.key));
  if (open.length) {
    const top = Math.min(...open.map(h => ORDER[h.level]));
    const pool = open.filter(h => ORDER[h.level] === top);
    const hazard = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    const base = ACCIDENTS[hazard.key] ?? genericAccident(hazard);
    return { kind: "accident", hazard, beat: { ...base, id: `event-${hazard.key}`, event: true } };
  }
  const key = rand() < 0.5 ? "hairball" : "budget";
  return { kind: "minor", key, beat: { ...MINOR[key], id: `event-${key}`, event: true } };
}
