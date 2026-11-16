// 虛擬飼養：今日照顧狀態（碗裡的飼料、水、砂盆剩幾坨），同一天維持、隔天清空。
import { describe, expect, it } from "vitest";
import { dayAfter, newDay, parseDay } from "./care-day";
import { initialPlay, playReducer, type PlayState } from "./flow";
import { STORY } from "./story";

const bowl = { dry: 35, wet: 0, soup: 0 };

describe("dayAfter", () => {
  it("新的一天：碗是空的、水沒換、砂盆還沒看過", () => {
    expect(newDay(2)).toEqual({ node: 2, feed: { dry: 0, wet: 0, soup: 0 }, water: 0, litter: null, done: [] });
  });
  it("倒過飼料、換過水、鏟過砂盆，照結果記下來；做好的記進 done", () => {
    let d = dayAfter(newDay(0), "feed", { added: 35, total: 35, over: false, spill: 0, bowl });
    expect(d.feed).toEqual(bowl);
    expect(d.done).toEqual(["feed"]);
    d = dayAfter(d, "water", { fill: 80 });
    expect(d.water).toBe(80);
    d = dayAfter(d, "scoop", { bagged: 4, total: 6 });
    expect(d.litter).toBe(2);
    expect(d.done).toEqual(["feed", "water"]);
    d = dayAfter(d, "scoop", { bagged: 2, total: 2 });
    expect(d.litter).toBe(0);
    expect(d.done).toContain("scoop");
  });
  it("關掉（null）不改任何東西", () => {
    const d = dayAfter(newDay(0), "scoop", null);
    expect(d).toEqual(newDay(0));
  });
  it("讀存檔：格式不對就當新的一天", () => {
    expect(parseDay({ node: 1, feed: bowl, water: 80, litter: 0, done: ["feed", "x"] }, 1)).toEqual({ node: 1, feed: bowl, water: 80, litter: 0, done: ["feed"] });
    expect(parseDay({ node: 0, feed: bowl }, 1)).toEqual(newDay(1));
    expect(parseDay("壞掉", 1)).toEqual(newDay(1));
  });
});

/** 開始第一個節點，一路按到第一個小遊戲（第 1 天沒有，第 3 天有餵貓、鏟屎） */
function toHome(nodeIndex: number, s: PlayState = playReducer(initialPlay(), { type: "startNodes", catName: "麻糬", labels: [], once: 0, monthly: 0 })) {
  for (let g = 0; g < 300 && !(s.nodeIndex === nodeIndex && s.cur?.kind === "home"); g++) {
    const c = s.cur!;
    if (c.kind === "ask") s = playReducer(s, { type: "choose", index: 0 });
    else if (c.kind === "mini") s = playReducer(s, { type: "miniDone", result: c.mini === "feed" ? { added: 35, total: 35, over: false, spill: 0, bowl } : null });
    else if (c.kind === "relocate") s = playReducer(s, { type: "relocated" });
    else s = playReducer(s, { type: "next" });
  }
  return s;
}

describe("flow 的今日照顧狀態", () => {
  it("劇情裡餵過飯，在家的時光碗還是滿的、餵貓已經算做過；劇情裡關掉鏟屎＝沒鏟，紀錄照實寫", () => {
    const day3 = STORY.findIndex(n => n.id === "day3");
    const s = toHome(day3);
    expect(s.today.node).toBe(day3);
    expect(s.today.feed).toEqual(bowl);
    expect(s.homeDone).toContain("feed");
    expect(s.homeDone).not.toContain("scoop");
    expect(s.life.picks.some(p => p.node === "day3" && p.good === false && p.t.includes("沒有鏟屎"))).toBe(true);
  });
  it("今天已經做好的照顧，再做一次不再給獎勵也不再記一次", () => {
    let s = toHome(0);
    s = playReducer(s, { type: "care", act: "scoop", good: true, result: { bagged: 6, total: 6 } });
    const once = { h: s.life.care.hygiene, log: s.life.care.log.scoop, stress: s.life.stress };
    expect(s.today.litter).toBe(0);
    s = playReducer(s, { type: "care", act: "scoop", good: false, result: { bagged: 0, total: 0 } });
    expect({ h: s.life.care.hygiene, log: s.life.care.log.scoop, stress: s.life.stress }).toEqual(once);
  });
  it("沒鏟（0 坨）不算做過、不記紀錄；鏟一部分照比例、記下還有幾坨沒鏟", () => {
    let s = toHome(0);
    const h0 = s.life.care.hygiene;
    s = playReducer(s, { type: "care", act: "scoop", good: false, result: { bagged: 0, total: 6 } });
    expect(s.life.care.hygiene).toBe(h0);
    expect(s.life.care.log.scoop).toBeUndefined();
    expect(s.homeTried).not.toContain("scoop");
    s = playReducer(s, { type: "care", act: "scoop", good: false, result: { bagged: 4, total: 6 } });
    expect(s.life.care.hygiene).toBe(h0 + 7);
    expect(s.today.litter).toBe(2);
    expect(s.homeTried).toContain("scoop");
    expect(s.life.notes.at(-1)?.t).toContain("還有 2 坨沒鏟");
  });
  it("隔天（下一個節點）碗清空、砂盆又有新的砂團", () => {
    let s = toHome(0);
    s = playReducer(s, { type: "care", act: "feed", good: true, result: { added: 35, total: 35, over: false, spill: 0, bowl } });
    expect(s.today.feed).toEqual(bowl);
    s = playReducer(s, { type: "next" });
    expect(s.nodeIndex).toBe(1);
    expect(s.today).toEqual(newDay(1));
    expect(s.checkpoint?.today).toEqual(newDay(1));
  });
});
