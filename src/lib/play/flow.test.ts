// 虛擬飼養 DEMO（#237）：newgame 版流程狀態機——6 個節點＋結尾、每個節點後的「在家的時光」、節點 5 居家意外（送獸醫／虛驚）、節點 6 健檢。
import { describe, expect, it } from "vitest";
import { careEffect, CARE_ACTS, skipEffect } from "./care";
import { initialPlay, playReducer, prevSetupStep, STEPS, type PlayAction, type PlayState } from "./flow";
import { ruleHazards, type Hazard } from "./hazards";
import { DEMO_DOLLHOUSE, inventoryFromPlan } from "./room";
import { farewellCaption, STORY, topRisk, VET_RISKS, type CatTraits } from "./story";

const labels = inventoryFromPlan(DEMO_DOLLHOUSE).labels;
const hazards: Hazard[] = ruleHazards({ labels, hasWindow: true });

interface Opts { hazards?: Hazard[]; doCare?: boolean; careGood?: boolean; choose?: (labels: string[]) => number }

/** 從頭玩到報告；每個在家的時光都把 6 個動作做完（doCare）或全部跳過 */
function playThrough(opts: Opts & { startMonths?: number; cat?: CatTraits } = {}) {
  let s: PlayState = initialPlay();
  const seen: string[] = [];
  const personal: string[] = [];
  const homes: number[] = [];
  const go = (a: PlayAction) => { s = playReducer(s, a); };
  // 背景讀到空間後在背景算出居家危險（給故事事件用），不再有「上傳房間」「居家安全」兩關
  go({ type: "setHazards", hazards: opts.hazards ?? hazards });
  go({ type: "next" }); go({ type: "next" });
  go({ type: "startNodes", catName: "麻糬", labels, once: 2700, monthly: 2000, shopPicks: [{ t: "每月存醫療預備金", good: true }], startMonths: opts.startMonths, cat: opts.cat });
  for (let guard = 0; guard < 600 && s.step === "node"; guard++) {
    const c = s.cur!;
    if (c.kind === "lines") seen.push(...c.lines.map(l => l.t));
    if (c.kind === "personal") personal.push(String(s.life.age));
    if (c.kind === "ask") go({ type: "choose", index: opts.choose ? opts.choose(c.options.map(o => o.l)) : 0 });
    else if (c.kind === "mini") go({ type: "miniDone", result: true });
    else if (c.kind === "relocate") go({ type: "relocated" });
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
    s = playReducer(s, { type: "startNodes", catName: "麻糬", labels, once: 0, monthly: 0 });
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

  it("節點 1：中途把外出籠交給你，貓一直縮在籠裡；台詞裡沒有床底", () => {
    const { seen } = playThrough();
    const all = seen.join("");
    expect(all).toContain("中途把外出籠交給你");
    expect(all).toContain("一直縮在外出籠最裡面");
    expect(all).not.toContain("提籃");
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
  it("結尾：前一天沒什麼活力、隔天在睡夢中離去，沒有選擇；享年那句在暗幕裡（farewellCaption）", () => {
    const { seen, s } = playThrough();
    const all = seen.join("\n");
    expect(all).toContain("沒什麼活力");
    expect(all).toContain("在睡夢中");
    expect(all.indexOf("沒什麼活力")).toBeLessThan(all.indexOf("在睡夢中"));
    expect(farewellCaption(s.life)).toBe("麻糬享年 15 歲。牠在你家度過了一生。");
    expect(s.life.picks.some(p => p.t === "陪伴到最後。")).toBe(true);
  });

  it("結局的暗幕跳到報告（finish）：剩下的台詞、紀錄一次走完，停在報告；選項、小遊戲不會被跳過", () => {
    let s = playReducer(initialPlay(), { type: "startNodes", catName: "麻糬", labels: [], once: 0, monthly: 0 });
    s = playReducer({ ...s, cur: { kind: "lines", lines: [] }, queue: [], nodeIndex: STORY.length - 1 }, { type: "finish" });
    expect(s.step).toBe("report");
    const asking = playReducer(initialPlay(), { type: "startNodes", catName: "麻糬", labels: [], once: 0, monthly: 0 });
    let a = asking;
    for (let i = 0; i < 20 && a.cur?.kind !== "ask" && a.cur?.kind !== "mini"; i++) a = playReducer(a, { type: "next" });
    expect(playReducer(a, { type: "finish" })).toBe(a);
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

describe("年紀大的貓", () => {
  const texts = (r: ReturnType<typeof playThrough>) => r.seen.join("|");
  it("14 歲的貓：結尾不超過 20 歲、年紀往上、劇情不再寫小貓", () => {
    const r = playThrough({ startMonths: 168 });
    expect(r.s.life.age).toBeLessThanOrEqual(240);
    expect(r.s.life.age).toBeGreaterThan(168);
    expect(farewellCaption(r.s.life)).toContain("享年 20 歲");
    expect(texts(r)).not.toContain("毛球就咻地鑽進");
    expect(texts(r)).not.toContain("小貓");
    expect(texts(r)).not.toContain("十歲了");
  });
  it("2 個月的小貓：照原本劇本，結尾 15 歲", () => {
    const r = playThrough();
    expect(farewellCaption(r.s.life)).toContain("享年 15 歲");
    expect(texts(r)).toContain("10 歲了");
    expect(texts(r)).toContain("小貓");
  });
});

describe("跟著這隻貓的資料走", () => {
  const all = (cat: CatTraits) => playThrough({ cat }).seen.join("|");
  it("花色：橘貓寫橘貓、三花寫三花貓、沒填只寫貓，不再固定虎斑", () => {
    expect(all({ coat: "橘貓", sex: "unknown", neutered: null })).toContain("小小的橘貓");
    expect(all({ coat: "三花", sex: "unknown", neutered: null })).toContain("小小的三花貓");
    expect(all({ coat: null, sex: "unknown", neutered: null })).toContain("小小的貓");
    expect(all({ coat: "橘貓", sex: "male", neutered: null })).not.toContain("虎斑");
  });
  it("結紮主題：公貓看到噴尿、母貓看到半夜叫，然後去看醫生", () => {
    const m = all({ coat: null, sex: "male", neutered: null }), f = all({ coat: null, sex: "female", neutered: null });
    expect(m).toContain("噴尿"); expect(m).toContain("公貓差不多"); expect(m).not.toContain("半夜一直叫");
    expect(f).toContain("半夜一直叫"); expect(f).toContain("母貓差不多"); expect(f).not.toContain("牆角、紙箱旁噴尿");
    expect(all({ coat: null, sex: "unknown", neutered: null })).not.toMatch(/公貓差不多|母貓差不多/);
  });
  it("已經結紮：沒有結紮主題，節點 4 是平凡的一天，不收手術費", () => {
    const r = playThrough({ cat: { coat: null, sex: "male", neutered: true } });
    const t = r.seen.join("|");
    expect(t).toContain("今天沒有什麼特別的事"); expect(t).toContain("已經結紮了"); expect(t).not.toContain("明天帶牠去給醫生看看");
    const open = playThrough({ cat: { coat: null, sex: "male", neutered: false } });
    expect(open.s.life.cost.med - r.s.life.cost.med).toBe(3500);
  });
  it("成貓：不管有沒有結紮資料，節點 4 都是平凡的一天", () => {
    const t = playThrough({ startMonths: 36, cat: { coat: null, sex: "male", neutered: null } }).seen.join("|");
    expect(t).toContain("今天沒有什麼特別的事"); expect(t).not.toContain("結紮了嗎");
    expect(t).not.toContain("明天帶牠去給醫生看看");
  });

});

describe("起始心情來自中途評論", () => {
  it("startNodes 帶 mood 就用它當一開始的信任與壓力", () => {
    const s = playReducer(initialPlay(), { type: "startNodes", catName: "小花", labels: [], once: 0, monthly: 0, mood: { trust: 55, stress: 22 } });
    expect(s.life.trust).toBe(55); expect(s.life.stress).toBe(22);
  });
});

describe("第 3 天：砂盆搬家", () => {
  it("選分開放：等玩家重新擺好貓砂盆才往下演；放一起也要搬", () => {
    for (const [idx, mode] of [[0, "apart"], [1, "together"]] as const) {
      let s = playReducer(initialPlay(), { type: "startNodes", catName: "小花", labels: [], once: 0, monthly: 0 });
      while (s.cur?.kind !== "ask" || s.nodeIndex !== 1) s = playReducer(s, s.cur?.kind === "ask" ? { type: "choose", index: 0 } : s.cur?.kind === "home" ? { type: "next" } : { type: "next" });
      s = playReducer(s, { type: "choose", index: idx });
      expect(s.cur).toMatchObject({ kind: "relocate", mode });
      s = playReducer(s, { type: "relocated" });
      expect(s.cur?.kind).toBe("lines");
    }
  });
});

describe("在家的時光：做好才算完成", () => {
  it("做壞只記下試過，不算完成；結束時不再重複扣沒做的分", () => {
    let s = playReducer(initialPlay(), { type: "startNodes", catName: "小花", labels: [], once: 0, monthly: 0 });
    while (s.cur?.kind !== "home") s = playReducer(s, s.cur?.kind === "ask" ? { type: "choose", index: 0 } : s.cur?.kind === "mini" ? { type: "miniDone", result: true } : s.cur?.kind === "relocate" ? { type: "relocated" } : { type: "next" });
    s = playReducer(s, { type: "care", act: "feed", good: false });
    expect(s.homeDone).not.toContain("feed"); expect(s.homeTried).toContain("feed");
    s = playReducer(s, { type: "care", act: "water", good: true });
    expect(s.homeDone).toContain("water");
  });
});


describe("back：開場設定的上一步", () => {
  it("擺用品回採買、採買回你的家；其他狀態原樣保留", () => {
    let s = playReducer(playReducer(initialPlay(), { type: "next" }), { type: "next" });
    s = playReducer(s, { type: "toggleHandled", key: "k" });
    expect(s.step).toBe("place");
    const shop = playReducer(s, { type: "back" });
    expect(shop).toEqual({ ...s, step: "shop" });
    expect(playReducer(shop, { type: "back" }).step).toBe("background");
    // 回去之後再往下走，還是同一條路
    expect(playReducer(playReducer(shop, { type: "back" }), { type: "next" }).step).toBe("shop");
  });
  it("你的家、飼養、報告沒有上一步", () => {
    const home = initialPlay();
    expect(playReducer(home, { type: "back" })).toBe(home);
    const node = playReducer(initialPlay(), { type: "startNodes", catName: "麻糬", labels: [], once: 0, monthly: 0 });
    expect(node.step).toBe("node");
    expect(playReducer(node, { type: "back" })).toBe(node);
    const report: PlayState = { ...node, step: "report" };
    expect(playReducer(report, { type: "back" })).toBe(report);
  });
  it("prevSetupStep：只有採買、擺用品有上一步", () => {
    expect(STEPS.map(prevSetupStep)).toEqual([null, "background", "shop", null, null]);
  });
});
