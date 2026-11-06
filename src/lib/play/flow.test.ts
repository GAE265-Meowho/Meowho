// 虛擬飼養 DEMO（#237）：流程狀態機（照 catgame 原版劇情）與「意外只在節點 2、只發生一次、從沒處理的危險挑」
import { describe, expect, it } from "vitest";
import { FEV, HAZ_FEV, pickNodeEvent } from "./events";
import { initialPlay, playReducer, type PlayAction, type PlayState } from "./flow";
import { ruleHazards, type Hazard } from "./hazards";
import { DEMO_DOLLHOUSE, inventoryFromPlan } from "./room";
import { fullLifeWords, STORY } from "./story";

const labels = inventoryFromPlan(DEMO_DOLLHOUSE).labels;
const hazards: Hazard[] = ruleHazards({ labels, hasWindow: true });
const MINI: Record<string, unknown> = { hide: 0, scoop: { bagged: 6, total: 6, small: false }, play: { fun: 60, toy: "feather", match: true, rhythmOk: true } };

/** 從頭玩到報告；choose(text) 決定每個選項選哪一個（預設第一個） */
function playThrough(handled: string[], opts: { rand?: () => number; choose?: (labels: string[]) => number; mini?: Record<string, unknown> } = {}) {
  const rand = opts.rand ?? (() => 0.3);
  let s: PlayState = initialPlay();
  const seen: string[] = [];
  const personal: string[] = [];
  const go = (a: PlayAction) => { s = playReducer(s, a, rand); };
  go({ type: "next" }); go({ type: "next" });
  go({ type: "setHazards", hazards });
  handled.forEach(key => go({ type: "toggleHandled", key }));
  go({ type: "next" }); go({ type: "next" });
  go({ type: "startNodes", labels, once: 2700, monthly: 2000, shopPicks: [{ t: "每月存醫療預備金", good: true }], rand });
  for (let guard = 0; guard < 300 && s.step === "node"; guard++) {
    const c = s.cur!;
    if (c.kind === "lines") seen.push(...c.lines.map(l => l.t));
    if (c.kind === "personal") personal.push(s.life.age.toString());
    if (c.kind === "ask") go({ type: "choose", index: opts.choose ? opts.choose(c.options.map(o => o.l)) : 0 });
    else if (c.kind === "mini") go({ type: "miniDone", result: (opts.mini ?? MINI)[c.mini] });
    else go({ type: "next" });
  }
  return { s, seen, personal };
}

describe("流程（原版劇情）", () => {
  it("從頭玩到試養報告；三個節點都有紀錄，每個節點有一段個人化台詞", () => {
    const { s, personal } = playThrough([]);
    expect(s.step).toBe("report");
    expect(new Set(s.life.picks.map(p => p.node))).toEqual(new Set(["first-day", "five-years", "farewell"]));
    expect(personal).toHaveLength(3);
  });

  it("台詞照原版：小安的叮嚀、伴侶過敏、享年 15 歲；麻糬是虎斑", () => {
    const { seen } = playThrough([]);
    const all = seen.join("\n");
    expect(all).toContain("虎斑毛球");
    expect(all).not.toContain("白色的毛球");
    expect(all).toContain("小貓一天要吃 3 到 4 餐");
    expect(all).toContain("哈啾");
    // 這一輪：伴侶過敏（你的戀愛）＋咬電線就醫（看醫生的日子）
    expect(all).toContain("麻糬享年 15 歲。牠陪你走過了你的戀愛、看醫生的日子，和好多個普通的晚上。");
  });

  it("〈通稱〉換成示範客廳的家具：躲藏處＝沙發底下", () => {
    const { seen } = playThrough([]);
    expect(seen.join("")).toContain("鑽進了沙發底下");
    expect(seen.join("")).not.toMatch(/〈|〉/);
  });

  it("意外只在節點 2 發生，而且整場只發生一次", () => {
    const { s } = playThrough([]);
    expect(s.eventNodes).toEqual(["five-years"]);
    expect(s.life.events).toHaveLength(1);
    expect(s.life.events[0].node).toBe("five-years");
  });

  it("意外從玩家沒有處理的危險裡挑，用原版 FEV 的事件（大門 → 受驚衝出門）", () => {
    const keep = hazards.filter(h => h.key !== "door").map(h => h.key);
    const { s, seen } = playThrough(keep);
    expect(s.event?.kind).toBe("accident");
    expect(s.life.events[0]).toMatchObject({ id: "dashout", t: "受驚衝出門" });
    expect(seen.join("")).toContain("外送來了。你一開大門");
  });

  it("全部都處理了：改成毛球嘔吐或經濟吃緊，劇情先肯定玩家的準備", () => {
    const all = hazards.map(h => h.key);
    for (const r of [0.2, 0.8]) {
      const { s, seen } = playThrough(all, { rand: () => r });
      expect(s.event?.kind).toBe("minor");
      expect(["hairball", "money"]).toContain(s.event?.id);
      expect(seen.join("")).toContain("把家裡的危險都處理好了");
    }
  });

  it("花費分類：第一次健檢 1,000 算醫療；每月花費依月齡累計（原版 X.monthly × months）", () => {
    const { s } = playThrough([], { choose: l => l.findIndex(x => x.includes("在家安寧")) >= 0 ? l.findIndex(x => x.includes("在家安寧")) : 0 });
    expect(s.life.cost.once).toBe(2700);
    expect(s.life.cost.month).toBeCloseTo(2000 * (181.3 - 2), 5);
    expect(s.life.cost.med).toBeGreaterThanOrEqual(1000);
    expect(s.life.cost.other).toBeGreaterThanOrEqual(8000); // 伴侶過敏：空氣清淨機等 8,000（原版沒有分類＝其他）
  });

  it("送養結局（原版 { end: true }）：直接進報告，不演後面的節點", () => {
    const { s } = playThrough([], { choose: l => Math.max(0, l.findIndex(x => x.includes("找新主人"))) });
    expect(s.step).toBe("report");
    expect(s.life.abandoned).toBe(true);
    expect(s.life.picks.some(p => p.node === "farewell")).toBe(false);
  });

  it("小遊戲結果照原版判定：躲床底硬抓（1）＝可以再想想", () => {
    const { s } = playThrough([], { mini: { ...MINI, hide: 1 } });
    expect(s.life.picks.find(p => p.t.startsWith("到家第一天"))).toMatchObject({ t: "到家第一天，硬把牠拉出來", good: false });
  });

  it("示範客廳沒有可關門的房間：伴侶過敏只剩兩個選項（原版 need）", () => {
    let opts: string[] = [];
    playThrough([], { choose: l => { if (l.some(x => x.includes("找新主人"))) opts = l; return 0; } });
    expect(opts).toHaveLength(2);
  });
});

describe("pickNodeEvent", () => {
  const X = { labels, name: "麻糬" };
  it("節點 1、3 一律回 null", () => {
    expect(pickNodeEvent("first-day", hazards, [], X)).toBeNull();
    expect(pickNodeEvent("farewell", hazards, [], X)).toBeNull();
  });
  it("有原版事件的危險優先、等級高的優先（電線 → 咬電線）", () => {
    expect(pickNodeEvent("five-years", hazards, [], X, () => 0)?.id).toBe("cable");
  });
  it("對照表裡的事件都存在於 FEV", () => {
    for (const id of Object.values(HAZ_FEV)) expect(FEV[id]).toBeDefined();
  });
  it("只剩沒有原版事件的危險（窗戶）：用通用劇情帶入建議", () => {
    const ev = pickNodeEvent("five-years", hazards, hazards.filter(h => h.key !== "window").map(h => h.key), X);
    expect(ev?.kind).toBe("accident");
    expect(ev?.id).toBe("haz_window");
  });
  it("節點 1、3 的劇本裡沒有事件步驟", () => {
    for (const n of [STORY[0], STORY[2]]) expect(JSON.stringify(n.steps)).not.toContain("events");
  });
});

describe("fullLifeWords（原版）", () => {
  it("只說這次真的經歷過的事", () => {
    expect(fullLifeWords({ picks: [] })).toBe("到家的第一天、半夜的跑酷");
    expect(fullLifeWords({ picks: [{ t: "伴侶過敏：一起找兩全的方法", good: true, node: "five-years" }] })).toBe("你的戀愛");
  });
});
