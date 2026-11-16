import { describe, expect, it } from "vitest";
import { initialPlay, playReducer, type PlayAction, type PlayState } from "./flow";
import { buildProgress, parseSaved, progressKey, progressLabel, PROGRESS_LIMIT } from "./save";
import { STORY } from "./story";

const labels = ["沙發", "床"];
const start = (): PlayState => playReducer(initialPlay(), { type: "startNodes", catName: "麻糬", labels, once: 2700, monthly: 2000, startMonths: 2, mood: { trust: 33, stress: 44 } });

/** 一路玩到下一個節點的開頭，回傳那時的狀態 */
function playToNode(s0: PlayState, target: number): PlayState {
  let s = s0;
  const go = (a: PlayAction) => { s = playReducer(s, a); };
  for (let guard = 0; guard < 600 && s.step === "node" && s.nodeIndex < target; guard++) {
    const c = s.cur!;
    if (c.kind === "ask") go({ type: "choose", index: 0 });
    else if (c.kind === "mini") go({ type: "miniDone", result: true });
    else if (c.kind === "relocate") go({ type: "relocated" });
    else go({ type: "next" });
  }
  return s;
}

describe("checkpoint：每個節點開始前的快照", () => {
  it("開始時有第 0 個節點的快照，帶著採買算好的花費與貓的心情", () => {
    const s = start();
    expect(s.checkpoint?.nodeIndex).toBe(0);
    expect(s.checkpoint?.life.cost.once).toBe(2700);
    expect(s.checkpoint?.life.trust).toBe(33);
    expect(s.checkpoint?.monthly).toBe(2000);
  });
  it("每過一個節點快照往前走一格，快照是進入節點之前的狀態", () => {
    const s = playToNode(start(), 2);
    expect(s.nodeIndex).toBe(2);
    expect(s.checkpoint?.nodeIndex).toBe(2);
    // 快照是進節點前：還沒累計第 3 個節點的每月花費
    expect(s.checkpoint!.life.cost.month).toBeLessThan(s.life.cost.month + 1);
    expect(s.checkpoint!.life.cost.month).toBeLessThanOrEqual(s.life.cost.month);
  });
  it("restart 清掉快照", () => expect(playReducer(start(), { type: "restart" }).checkpoint).toBeNull());
});

describe("resume：續玩回到節點開頭", () => {
  it("從快照回到那個節點，信任、壓力、花費、選過的選項都還在", () => {
    const mid = playToNode(start(), 2);
    const saved = JSON.parse(JSON.stringify(buildProgress({ cp: mid.checkpoint!, pick: null, placed: [], scanSpots: {}, hhId: "h1" })));
    const back = playReducer(initialPlay(), { type: "resume", cp: parseSaved(saved)!.cp! });
    expect(back.step).toBe("node");
    expect(back.nodeIndex).toBe(2);
    expect(back.cur).not.toBeNull();
    expect(back.life.trust).toBe(mid.checkpoint!.life.trust);
    expect(back.life.stress).toBe(mid.checkpoint!.life.stress);
    expect(back.life.picks.length).toBe(mid.checkpoint!.life.picks.length);
    expect(back.life.name).toBe("麻糬");
    expect(back.startMonths).toBe(2);
    expect(back.checkpoint?.nodeIndex).toBe(2);
  });
  it("續玩後能一路玩到報告", () => {
    const mid = playToNode(start(), 3);
    let s = playReducer(initialPlay(), { type: "resume", cp: JSON.parse(JSON.stringify(mid.checkpoint)) });
    for (let guard = 0; guard < 600 && s.step === "node"; guard++) {
      const c = s.cur!;
      if (c.kind === "ask") s = playReducer(s, { type: "choose", index: 0 });
      else if (c.kind === "mini") s = playReducer(s, { type: "miniDone", result: true });
      else if (c.kind === "relocate") s = playReducer(s, { type: "relocated" });
      else s = playReducer(s, { type: "next" });
    }
    expect(s.step).toBe("report");
  });
});

describe("parseSaved：壞掉的存檔回傳 null", () => {
  const good = () => JSON.parse(JSON.stringify(buildProgress({ cp: start().checkpoint!, pick: { budget: 5000 }, placed: [{ key: "a" }], scanSpots: { bowl: "床旁" }, hhId: "h1" })));
  it("正常的存檔讀得回來", () => {
    const p = parseSaved(good())!;
    expect(p.cp?.nodeIndex).toBe(0);
    expect(p.pick).toEqual({ budget: 5000 });
    expect(p.scanSpots).toEqual({ bowl: "床旁" });
    expect(p.hhId).toBe("h1");
  });
  it("空的、舊的、版本不對、節點超出範圍都回傳 null", () => {
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved({ done: [], choices: {} })).toBeNull();
    expect(parseSaved({ ...good(), v: 2 })).toBeNull();
    const g = good(); g.cp.nodeIndex = STORY.length;
    expect(parseSaved(g)).toBeNull();
    const h = good(); delete h.cp.life.care;
    expect(parseSaved(h)).toBeNull();
  });
});

describe("buildProgress：不超過資料庫上限", () => {
  it("一般大小原樣保存", () => {
    const cp = start().checkpoint!;
    expect(buildProgress({ cp, pick: null, placed: [], scanSpots: {}, hhId: null }).cp?.life.picks).toEqual(cp.life.picks);
  });
  it("紀錄長到超過上限時縮短，仍然讀得回來", () => {
    const cp = start().checkpoint!;
    const long = "很長的紀錄".repeat(40);
    const life = { ...cp.life, picks: Array.from({ length: 300 }, () => ({ t: long, good: true, node: "day1" as const })), notes: Array.from({ length: 300 }, () => ({ t: long, node: "day1" as const, spent: 1 })), events: [] };
    const out = buildProgress({ cp: { ...cp, life }, pick: null, placed: [], scanSpots: {}, hhId: null });
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThanOrEqual(PROGRESS_LIMIT);
    expect(parseSaved(JSON.parse(JSON.stringify(out)))).not.toBeNull();
  });
});

describe("progressLabel：回任務按鈕的文字", () => {
  it("顯示貓名與第幾個節點", () => {
    const mid = playToNode(start(), 1);
    expect(progressLabel("妹妹", JSON.parse(JSON.stringify(buildProgress({ cp: mid.checkpoint!, pick: null, placed: [], scanSpots: {}, hhId: null }))))).toBe(`妹妹的任務 2／${STORY.length}`);
  });
  it("還沒存過進度就是第 1 個", () => expect(progressLabel("妹妹", {})).toBe(`妹妹的任務 1／${STORY.length}`));
});

describe("存檔：掃描房間自由擺放（選填欄位）", () => {
  it("有擺就存、讀回一樣；沒擺或舊存檔就沒有這欄", () => {
    const cp = start().checkpoint!;
    const saved = JSON.parse(JSON.stringify(buildProgress({ cp, pick: null, placed: [], scanSpots: { bowl: "自選位置" }, scanPose: { bowl: { x: 1.2, z: 0.5, rot: 1 } }, hhId: null })));
    expect(parseSaved(saved)?.scanPose).toEqual({ bowl: { x: 1.2, z: 0.5, rot: 1 } });
    const old = JSON.parse(JSON.stringify(buildProgress({ cp, pick: null, placed: [], scanSpots: {}, hhId: null })));
    expect("scanPose" in old).toBe(false);
    expect(parseSaved(old)?.scanPose).toBeUndefined();
  });
});

describe("開場設定階段的存檔（還沒進節點，cp＝null）", () => {
  const setup = (step: "background" | "shop" | "place" = "place") =>
    JSON.parse(JSON.stringify(buildProgress({ cp: null, setupStep: step, pick: { budget: 5000, dryId: "d1" }, placed: [{ key: "bowl:1" }], scanSpots: { bowl: "床旁" }, hhId: "h1" })));
  it("存下目前在哪一步與採買、擺放、喵戶，讀得回來", () => {
    const p = parseSaved(setup())!;
    expect(p.cp).toBeNull();
    expect(p.setupStep).toBe("place");
    expect(p.pick).toEqual({ budget: 5000, dryId: "d1" });
    expect(p.placed).toEqual([{ key: "bowl:1" }]);
    expect(p.scanSpots).toEqual({ bowl: "床旁" });
    expect(p.hhId).toBe("h1");
    expect(parseSaved(setup("shop"))!.setupStep).toBe("shop");
    expect(parseSaved(setup("background"))!.setupStep).toBe("background");
  });
  it("沒有 cp 又沒有合法的 setupStep 回傳 null", () => {
    expect(parseSaved({ ...setup(), setupStep: "node" })).toBeNull();
    expect(parseSaved({ ...setup(), setupStep: undefined })).toBeNull();
    expect(parseSaved({ v: 1, cp: null })).toBeNull();
  });
  it("舊格式（只有 cp、沒有 setupStep）照樣讀得回來，setupStep＝null", () => {
    const old = JSON.parse(JSON.stringify(buildProgress({ cp: start().checkpoint!, pick: null, placed: [], scanSpots: {}, hhId: null })));
    delete old.setupStep;
    const p = parseSaved(old)!;
    expect(p.cp?.nodeIndex).toBe(0);
    expect(p.setupStep).toBeNull();
  });
  it("進了節點之後存的進度不帶 setupStep（有 cp 就以 cp 為準）", () => {
    const p = parseSaved(JSON.parse(JSON.stringify({ ...buildProgress({ cp: start().checkpoint!, pick: null, placed: [], scanSpots: {}, hhId: null }), setupStep: "shop" })))!;
    expect(p.cp?.nodeIndex).toBe(0);
    expect(p.setupStep).toBeNull();
  });
  it("回任務按鈕：設定階段顯示第 1 個節點", () => {
    expect(progressLabel("妹妹", setup("shop"))).toBe(`妹妹的任務 1／${STORY.length}`);
  });
  it("progressKey：內容一樣（只差存檔時間）就不用重存", () => {
    const a = buildProgress({ cp: null, setupStep: "shop", pick: { budget: 1 }, placed: [], scanSpots: {}, hhId: "h", now: new Date(1) });
    const b = buildProgress({ cp: null, setupStep: "shop", pick: { budget: 1 }, placed: [], scanSpots: {}, hhId: "h", now: new Date(2) });
    const c = buildProgress({ cp: null, setupStep: "shop", pick: { budget: 2 }, placed: [], scanSpots: {}, hhId: "h", now: new Date(1) });
    expect(progressKey(a)).toBe(progressKey(b));
    expect(progressKey(a)).not.toBe(progressKey(c));
  });
});

describe("今日照顧狀態存進進度（選填、向下相容）", () => {
  it("快照帶著今天的狀態，存檔讀回來續玩照樣有；舊存檔沒有 today 就當新的一天", () => {
    const cp = start().checkpoint!;
    expect(cp.today).toEqual({ node: cp.nodeIndex, feed: { dry: 0, wet: 0, soup: 0 }, water: 0, litter: null, done: [] });
    const back = parseSaved(JSON.parse(JSON.stringify(buildProgress({ cp, pick: {}, placed: [], scanSpots: {}, hhId: null }))))!;
    expect(playReducer(initialPlay(), { type: "resume", cp: back.cp! }).today).toEqual(cp.today);
    const { today: _drop, ...old } = cp;
    void _drop;
    expect(playReducer(initialPlay(), { type: "resume", cp: old }).today.node).toBe(cp.nodeIndex);
  });
});
