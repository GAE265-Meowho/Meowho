// 虛擬飼養 DEMO（#237）：整場唯一一次居家意外，固定在節點 2「五年後」，插在主線之後（原版順序：主線 → 隨機事件 → 小叮嚀）。
// 劇情照 catgame 原版（24j 的 FEV）：從 AI（或規則）辨認出、而玩家沒有處理的危險挑一件，用對應的 FEV 事件演
//   cable 咬電線、string 吃塑膠繩、table 跳上桌子（桌上的水杯）、scratch 抓家具、dashout 衝出門（大門）；
// 全部都處理了就用原版節點 2 的 rand：hairball（毛球嘔吐）或 money（經濟吃緊）。
// 原版沒有對應事件的危險（窗戶、植物）沒處理時，用一段通用的劇情帶入建議（DEMO 補的）。節點 1、3 一律沒有事件。
import { homeHas, homeWord } from "./furniture";
import type { Hazard } from "./hazards";
import { ASK, BUB, END, REC, sc, WHO, XN, YO, type Life, type NodeId, type Step } from "./story";

export const EVENT_NODE: NodeId = "five-years";

/** 居家危險 key → 原版 FEV 事件 id（原版 FEV_HAZ 的反向，加上 DEMO 危險清單的 key） */
export const HAZ_FEV: Record<string, string> = { cable: "cable", string: "string", cup: "table", scratch: "scratch", door: "dashout" };

interface Fev { title: string; need?: (X: Life) => boolean; steps: (X: Life) => Step[] }

/** 原版 24j 的 FEV（只搬 DEMO 用得到的事件；文字照原文） */
export const FEV: Record<string, Fev> = {
  dashout: { title: "受驚衝出門", steps: X => [
    sc("room", "day"), XN(`外送來了。你一開〈門口〉，${X.name}嚇了一跳，咻地往門外衝。`),
    ASK("you", "（牠要跑出去了！）", [
      { l: "蹲低慢慢靠近，用零食把牠引回來；之後加一道防護門", fx: { spent: 2500, kind: "acc" }, set: "doorGate", pick: "衝出門：冷靜找回來，加裝防護門", good: true, then: [XN("牠躲在樓梯間發抖，聞到零食才慢慢走回來。隔週你裝了一道防護門。")] },
      { l: "大聲叫牠、衝過去抓", fx: { stress: 15, trust: -5 }, pick: "衝出門：追著抓", good: false, then: [BUB("sweat"), XN(`${X.name}越跑越遠，你找了一個多小時才在樓下的機車底下找到牠。`)] },
    ])] },
  table: { title: "跳上桌子", need: X => Boolean(homeWord("桌面", X.labels)), steps: X => [
    sc("room", "day"), XN(`${X.name}跳上了${homeWord("桌面", X.labels)}，把上面的東西一樣一樣撥到地上。`),
    ASK("you", "（桌上的東西要怎麼辦？）", [
      { l: "桌上不放小東西，再給牠一個可以爬的高處", fx: { spent: 1500 }, set: "tower", pick: "跳上桌子：收東西、給替代高處", good: true, then: [XN("牠很快就把新的跳台當成自己的地盤。")] },
      { l: "吼牠下來", fx: { stress: 5 }, pick: "跳上桌子：吼牠", good: false, then: [XN("牠在你面前不跳了，你不在的時候……")] },
    ])] },
  cable: { title: "咬電線", need: X => homeHas("cable", X.labels), steps: X => [
    sc("room", "day", "zoom"), XN(`你聽到「啪」的一聲，${X.name}嚇得跳開。地上的電線被咬破了。`),
    WHO("vet", "嘴巴裡有一點燙傷，這幾天要吃軟的食物。還好沒有更嚴重。電線一定要收好。", true),
    REC({ fx: { spent: 3000, kind: "acc" }, set: "cableSafe", note: "咬電線就醫", pick: "咬電線：就醫，之後電線加護套", good: null })] },
  string: { title: "吃塑膠繩", steps: X => [
    sc("room", "day"), XN(`${X.name}一直吐，也不太吃東西。你突然想起，昨天拆包裹的塑膠繩不見了一段。`),
    WHO("vet", "可能吞了細繩類的東西，這是緊急狀況，要立刻檢查，不要等。", true),
    ASK("you", "（要現在去嗎？）", [
      { l: "立刻帶去醫院", fx: { spent: 9000, kind: "med" }, pick: "吞異物：立刻就醫", good: true, then: [WHO("vet", "X 光看到腸胃裡有東西，還好及時處理，順利拿出來了。細繩類的東西一定要收好。", true)] },
      { l: "再觀察一天", fx: { spent: 25000, kind: "med", stress: 15, trust: -5 }, pick: "吞異物：拖了一天才就醫", good: false, then: [WHO("vet", "已經卡在腸子裡了，要開刀。吞了異物一定要馬上帶來。", true)] },
    ])] },
  scratch: { title: "抓家具", need: X => Boolean(homeWord("布料家具", X.labels)), steps: X => {
    const w = homeWord("布料家具", X.labels);
    return [
      sc("room", "day"), XN(`${w}上多了好幾道抓痕，線頭都跑出來了。`),
      ASK("you", "（牠為什麼要抓這裡？）", [
        { l: `在${w}旁邊放一個貓抓板`, fx: { spent: 300 }, set: "scratchFixed", pick: "抓家具：在旁邊放貓抓板", good: true, then: [XN("牠很快就改抓貓抓板了。")] },
        { l: "罵牠、把家具包起來", fx: { stress: 5 }, pick: "抓家具：罵牠", good: false, then: [XN("牠換了一個地方抓。")] },
      ])];
  } },
  hairball: { title: "毛球嘔吐", steps: X => [
    sc("room", "day"), XN(`${X.name}在地上吐了一條長長的毛球。吐完之後，牠又跑去吃飯了。`),
    WHO("vet", "偶爾吐毛球很常見，精神食慾正常可以先觀察；每天梳毛會減少毛球。如果一直吐、吐不出來或不吃東西，要帶來檢查。", true),
    ASK("you", "（要怎麼辦？）", [
      { l: "記下來，先觀察，開始每天梳毛", fx: { minutes: 5 }, set: "brushFur", pick: "毛球嘔吐：觀察並開始梳毛", good: true, then: [XN("之後幾週都沒有再吐。")] },
      { l: "帶去看醫生", fx: { spent: 1500, kind: "med" }, pick: "毛球嘔吐：帶去看醫生", good: null, then: [WHO("vet", "檢查沒有問題，是毛球。", true)] },
    ])] },
  money: { title: "經濟吃緊", steps: () => [
    sc("room", "night"), XN("公司這個月開始減薪。打開記帳 App，你發現下個月的錢不太夠。"),
    ASK("you", "（貓的開銷要怎麼調整？）", [
      { l: "少買零食和玩具", pick: "經濟吃緊：少買零食和玩具", good: true, then: [XN("省了一點錢，牠好像沒什麼差別。")] },
      { l: "動用急診預備金", set: "fundUsed", pick: "經濟吃緊：動用預備金", good: null, then: [XN("撐過去了，但預備金少了一大半。")] },
      { l: "延後健檢或回診", set: "checkLate", pick: "經濟吃緊：延後健檢", good: false, then: [XN("省下了一筆。但如果有什麼問題，可能會比較晚才發現。")] },
      { l: "跟家人借錢、找人幫忙", pick: "經濟吃緊：找家人幫忙", good: true, then: [XN("家人幫你撐過這兩個月。")] },
      { l: "考慮送養", pick: "經濟吃緊：送養", good: false, then: [XN("你把牠送到了中途之家。"), XN("經濟吃緊是常見的棄養原因。收養前準備一筆預備金，也可以先查好有哪些醫療援助管道。"), END] },
    ])] },
};

/** 原版沒有專屬事件的居家危險（窗戶、植物、AI 額外辨認的項目）：DEMO 補一段通用劇情，帶入建議 */
function genericAccident(h: Hazard): Fev {
  return { title: h.label, steps: X => [
    sc("room", "day", "zoom"), XN(`${X.name}一直在「${h.label}」附近打轉。之前辨認出來的這個風險，你還沒有處理。`),
    ASK("you", "（要怎麼辦？）", [
      { l: "先把牠帶開，今天就照建議處理", fx: { spent: 1000, kind: "acc" }, pick: `居家危險：處理${h.label}`, good: true, then: [YO(`（${h.advice}）`)] },
      { l: "應該沒關係，下次再說", pick: `居家危險：沒處理${h.label}`, good: false, then: [XN(`風險還在。${h.advice}`)] },
    ])] };
}

export type NodeEvent =
  | { kind: "accident"; id: string; hazard: Hazard; title: string; steps: (X: Life) => Step[] }
  | { kind: "minor"; id: "hairball" | "money"; title: string; steps: (X: Life) => Step[] };

const ORDER = { high: 0, medium: 1, low: 2 } as const;

/**
 * 這個節點要演哪一件事：只有 EVENT_NODE 會回傳事件。
 * 沒處理的危險裡，有原版事件（且條件成立）的優先，同樣依等級高的優先、同等級用 rand 挑；
 * 都沒有原版事件時用通用劇情；全部處理完挑 hairball 或 money。
 */
export function pickNodeEvent(nodeId: NodeId, hazards: Hazard[], handled: string[], X: Pick<Life, "labels" | "name">, rand: () => number = Math.random): NodeEvent | null {
  if (nodeId !== EVENT_NODE) return null;
  const open = hazards.filter(h => !handled.includes(h.key));
  const life = X as Life;
  const withFev = open.filter(h => HAZ_FEV[h.key] && (!FEV[HAZ_FEV[h.key]].need || FEV[HAZ_FEV[h.key]].need!(life)));
  const pool0 = withFev.length ? withFev : open;
  if (pool0.length) {
    const top = Math.min(...pool0.map(h => ORDER[h.level]));
    const pool = pool0.filter(h => ORDER[h.level] === top);
    const hazard = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    const id = HAZ_FEV[hazard.key];
    const fev = id && withFev.includes(hazard) ? FEV[id] : genericAccident(hazard);
    return { kind: "accident", id: id && withFev.includes(hazard) ? id : `haz_${hazard.key}`, hazard, title: fev.title, steps: fev.steps };
  }
  const id = rand() < 0.5 ? "hairball" : "money";
  // 全部處理了：劇情先肯定玩家的準備（DEMO 補的一句），再演原版的小狀況
  return { kind: "minor", id, title: FEV[id].title, steps: X2 => [XN(`因為你一開始就把家裡的危險都處理好了，這五年${X2.name}幾乎沒遇過什麼意外。`), ...FEV[id].steps(X2)] };
}
