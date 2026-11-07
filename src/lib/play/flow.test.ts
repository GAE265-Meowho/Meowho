// 虛擬飼養 DEMO（#237）：newgame 版流程狀態機——6 個節點＋結尾、每個節點後的「在家的時光」、節點 5 居家意外（送獸醫／虛驚）、節點 6 健檢。
import { describe, expect, it } from "vitest";
import { careEffect, CARE_ACTS, skipEffect } from "./care";
import { initialPlay, playReducer, STEPS, type PlayAction, type PlayState } from "./flow";
import { ruleHazards, type Hazard } from "./hazards";
import { DEMO_DOLLHOUSE, inventoryFromPlan } from "./room";
import { STORY, topRisk, VET_RISKS } from "./story";

const labels = inventoryFromPlan(DEMO_DOLLHOUSE).labels;
const hazards: Hazard[] = ruleHazards({ labels, hasWindow: true });

interface Opts { hazards?: Hazard[]; doCare?: boolean; careGood?: boolean; choose?: (labels: string[]) => number }

/** 從頭玩到報告；每個在家的時光都把 6 個動作做完（doCare）或全部跳過 */
function playThrough(opts: Opts = {}) {
  let s: PlayState = initialPlay();
  const seen: string[] = [];
  const personal: string[] = [];
  const homes: number[] = [];
  const go = (a: PlayAction) => { s = playReducer(s, a); };
  // 背景讀到空間後在背景算出居家危險（給故事事件用），不再有「上傳房間」「居家安全」兩關
  go({ type: "setHazards", hazards: opts.hazards ?? hazards });
  go({ type: "next" }); go({ type: "next" });
  go({ type: "startNodes", labels, once: 2700, monthly: 2000, shopPicks: [{ t: "每月存醫療預備金", good: true }] });
  for (let guard = 0; guard < 600 && s.step === "node"; guard++) {
    const c = s.cur!;
    if (c.kind === "lines") seen.push(...c.lines.map(l => l.t));
    if (c.kind === "personal") personal.push(String(s.life.age));
    if (c.kind === "ask") go({ type: "choose", index: opts.choose ? opts.choose(c.options.map(o => o.l)) : 0 });
    else if (c.kind === "mini") go({ type: "miniDone", result: true });
    else if (c.kind === "home") {
      homes.push(s.nodeIndex);
      if (opts.doCare ?? true) for (const { act } of CARE_ACTS) go({ type: "care", act, good: opts.careGood ?? true });
      go({ type: "next" });
    } else go({ type: "next" });
  }
  return { s, seen, personal, homes };
}

describe("步驟", () => {
  it("上傳房間、居家安全兩關已拿掉：背景（讀你的喵戶空間）→ 採買 → 擺用品 → 飼養 → 報告", () => {
    expect(STEPS).toEqual(["background", "shop", "place", "node", "report"]);
    let s: PlayState = initialPlay();
    expect(s.step).toBe("background");
    s = playReducer(s, { type: "next" }); expect(s.step).toBe("shop");
    s = playReducer(s, { type: "next" }); expect(s.step).toBe("place");
  });
  it("居家危險在背景設定，沒有關卡也會帶進故事（節點 5 取風險最高的一項）", () => {
    let s: PlayState = initialPlay();
    s = playReducer(s, { type: "setHazards", hazards });
    s = playReducer(s, { type: "startNodes", labels, once: 0, monthly: 0 });
    expect(s.life.risk).toEqual(topRisk(hazards));
  });
});

describe("流程（newgame v0.5）", () => {
  it("從頭玩到試養報告：6 個節點＋結尾，共 7 段", () => {
    expect(STORY.map(n => n.id)).toEqual(["day1", "day3", "day30", "month8", "year5", "year10", "farewell"]);
    const { s } = playThrough();
    expect(s.step).toBe("report");
    expect(new Set(s.life.picks.map(p => p.node))).toEqual(new Set(STORY.map(n => n.id)));
  });

  it("前 6 個節點結束後各有一輪在家的時光，結尾沒有", () => {
    const { s, homes } = playThrough();
    expect(homes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s.life.care.rounds).toBe(6);
  });

  it("節點 1：貓躲進外出籠；台詞裡沒有床底", () => {
    const { seen } = playThrough();
    const all = seen.join("");
    expect(all).toContain("鑽進你擺好的外出籠");
    expect(all).not.toContain("床底");
  });

  it("每個動作每輪可以重複做（渝茜 2026-11-07：想重複就重複），數值有上限", () => {
    let s = initialPlay();
    s = { ...s, cur: { kind: "home" }, homeDone: [] };
    s = playReducer(s, { type: "care", act: "scoop", good: true });
    const once = s.life.care.hygiene;
    s = playReducer(s, { type: "care", act: "scoop", good: true });
    expect(s.life.care.hygiene).toBeGreaterThan(once);
    expect(s.life.care.log.scoop).toBe(2);
    expect(s.homeDone).toEqual(["scoop"]);
    for (let i = 0; i < 20; i++) s = playReducer(s, { type: "care", act: "scoop", good: true });
    expect(s.life.care.hygiene).toBe(100);
  });

  it("沒做的動作：換水、鏟屎、刷牙數值下降", () => {
    const { s } = playThrough({ doCare: false });
    expect(s.life.care.water).toBeLessThan(50);
    expect(s.life.care.hygiene).toBeLessThan(50);
    expect(s.life.care.teeth).toBeLessThan(50);
  });

  it("節點 3 選每天練刷牙：刷牙成功的牙齒值加成", () => {
    expect(careEffect("brush", true, true).d.teeth).toBe(15);
    expect(careEffect("brush", true, false).d.teeth).toBe(10);
    expect(skipEffect("brush").d.teeth).toBe(-5);
  });
});

describe("節點 5：居家意外", () => {
  it("沒有玩家選擇；電線（最高等級）送獸醫，報告只寫一般說法、不寫風險名稱", () => {
    const { s, seen } = playThrough();
    const all = seen.join("\n");
    expect(all).toContain("特別感興趣");
    expect(all).toContain("你趕緊帶牠去動物醫院");
    expect(all).toContain("保險起見做了檢查");
    expect(s.life.events).toHaveLength(1);
    const pick = s.life.picks.find(p => p.node === "year5")!;
    expect(pick.t).toBe("發生了一次居家意外，帶去看了獸醫。");
    expect(s.life.cost.med).toBeGreaterThanOrEqual(2500);
    for (const h of hazards) expect(pick.t).not.toContain(h.label);
    expect(s.life.events[0].t).not.toMatch(/電線|窗戶/);
  });

  it("抓家具、杯子、門：虛驚一場，在家觀察，沒有醫療費", () => {
    const only = hazards.filter(h => !VET_RISKS.includes(h.key));
    const cup = only.length ? only : [{ key: "scratch", label: "抓家具", level: "low", advice: "放貓抓板" } as Hazard];
    const { s, seen } = playThrough({ hazards: cup });
    const all = seen.join("\n");
    expect(all).toContain("看起來沒事");
    expect(all).not.toContain("動物醫院");
    expect(s.life.picks.find(p => p.node === "year5")!.t).toBe("發生了一次居家虛驚，在家觀察。");
    expect(s.life.events[0].id).toBe("scare");
  });

  it("沒有風險清單：改演毛球小狀況，仍帶去看獸醫", () => {
    const { seen, s } = playThrough({ hazards: [] });
    expect(seen.join("\n")).toContain("吐了一團毛球");
    expect(s.life.events[0].id).toBe("incident");
  });

  it("topRisk 取等級最高的一項", () => {
    const r = topRisk([
      { key: "a", label: "A", level: "low", advice: "x" }, { key: "b", label: "B", level: "high", advice: "y" }, { key: "c", label: "C", level: "medium", advice: "z" },
    ]);
    expect(r?.key).toBe("b");
    expect(topRisk([])).toBeNull();
  });
});

describe("節點 6：熟齡健檢看累積數值", () => {
  it("每個動作都有做：牙齒保養得很好，沒有洗牙", () => {
    const { seen, s } = playThrough({ careGood: true });
    expect(seen.join("\n")).toContain("牙齒保養得很好");
    expect(seen.join("\n")).not.toContain("牙結石");
    expect(s.life.picks.some(p => p.t === "安排了熟齡健檢。")).toBe(true);
  });

  it("都沒做：牙結石、洗牙費用、飲水值低要追蹤；用語不下診斷", () => {
    const { seen, s } = playThrough({ doCare: false, choose: l => Math.max(0, l.findIndex(x => x.includes("增加飲水"))) });
    const all = seen.join("\n");
    expect(all).toContain("牙結石");
    expect(all).toContain("指標偏高");
    expect(all).not.toMatch(/腎臟病|糖尿病/);
    expect(s.life.cost.med).toBeGreaterThanOrEqual(7500);
  });
});

describe("結尾與花費", () => {
  it("結尾：享年 15 歲，沒有選擇", () => {
    const { seen } = playThrough();
    expect(seen.join("\n")).toContain("麻糬享年 15 歲");
  });

  it("每月花費依月齡累計，不寫死", () => {
    const { s } = playThrough();
    expect(s.life.cost.once).toBe(2700);
    expect(s.life.cost.month).toBeCloseTo(2000 * (180 - 2), 5);
  });

  it("三個節點有個人化台詞：第 1 天、五年後、結尾", () => {
    const { personal } = playThrough();
    expect(personal).toHaveLength(3);
  });
});
