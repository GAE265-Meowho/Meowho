// 虛擬飼養 DEMO（#237）：流程狀態機與「意外只在節點 2、只發生一次、從沒處理的危險挑」
import { describe, expect, it } from "vitest";
import { pickNodeEvent } from "./events";
import { currentBeat, initialPlay, nodeBeats, playReducer, type PlayAction, type PlayState } from "./flow";
import { ruleHazards, type Hazard } from "./hazards";
import { feedResult } from "./minigames";
import { STORY } from "./story";

const hazards: Hazard[] = ruleHazards({ labels: ["電腦", "茶几", "水杯", "花瓶", "門"], hasWindow: true });

/** 從頭玩到報告：每題選第一個、小遊戲直接給結果 */
function playThrough(handled: string[], rand = () => 0.3): PlayState {
  let s = initialPlay();
  const go = (a: PlayAction) => { s = playReducer(s, a, rand); };
  go({ type: "next" }); // background → room
  go({ type: "next" }); // room → hazards
  go({ type: "setHazards", hazards });
  handled.forEach(key => go({ type: "toggleHandled", key }));
  go({ type: "next" }); // → shop
  go({ type: "next" }); // → place
  go({ type: "startNodes", rand });
  for (let guard = 0; guard < 200 && s.step === "node"; guard++) {
    if (s.phase === "choice") go({ type: "choose", index: 0 });
    else if (s.phase === "mini") go({ type: "miniDone", result: feedResult(16, 16) });
    else go({ type: "next" });
  }
  return s;
}

describe("流程", () => {
  it("可以從頭玩到試養報告，三個節點都有紀錄", () => {
    const s = playThrough([]);
    expect(s.step).toBe("report");
    expect(new Set(s.choices.map(c => c.nodeId))).toEqual(new Set(STORY.map(n => n.id)));
    expect(s.minis.length).toBe(STORY.flatMap(n => n.beats).filter(b => b.mini).length);
  });

  it("意外只在節點 2 發生，而且整場只發生一次", () => {
    const s = playThrough([]);
    expect(s.eventNodes).toEqual(["five-years"]);
    const eventChoices = s.choices.filter(c => c.event);
    expect(eventChoices).toHaveLength(1);
    expect(eventChoices[0].nodeId).toBe("five-years");
  });

  it("意外從玩家沒有處理的危險裡挑", () => {
    const keep = hazards.filter(h => h.key !== "door").map(h => h.key);
    const s = playThrough(keep);
    expect(s.event?.kind).toBe("accident");
    if (s.event?.kind === "accident") expect(s.event.hazard.key).toBe("door");
  });

  it("全部都處理了：改成小狀況，劇情肯定玩家的準備", () => {
    const s = playThrough(hazards.map(h => h.key));
    expect(s.event?.kind).toBe("minor");
    expect(s.event?.beat.lines.map(l => l.text).join("")).toContain("處理好了");
  });

  it("節點 1、3 的段落沒有任何事件", () => {
    expect(nodeBeats(0, null).some(b => b.event)).toBe(false);
    expect(nodeBeats(2, null).some(b => b.event)).toBe(false);
  });

  it("選項要在 choice 階段才算；選完進回饋", () => {
    let s = playReducer(initialPlay(), { type: "startNodes", rand: () => 0 });
    expect(currentBeat(s)?.id).toBe("arrive");
    s = playReducer(s, { type: "choose", index: 0 });
    expect(s.choices).toHaveLength(0);
    s = playReducer(s, { type: "next" });
    expect(s.phase).toBe("choice");
    s = playReducer(s, { type: "choose", index: 1 });
    expect(s.phase).toBe("feedback");
    expect(s.choices[0].option.good).toBe(false);
    s = playReducer(s, { type: "next" });
    expect(s.phase).toBe("mini");
  });
});

describe("pickNodeEvent", () => {
  it("節點 1、3 一律回 null", () => {
    expect(pickNodeEvent("first-day", hazards, [])).toBeNull();
    expect(pickNodeEvent("farewell", hazards, [])).toBeNull();
  });

  it("優先挑等級高的未處理危險", () => {
    const ev = pickNodeEvent("five-years", hazards, ["cable"], () => 0);
    expect(ev?.kind).toBe("accident");
    if (ev?.kind === "accident") {
      expect(ev.hazard.key).toBe("window");
      expect(ev.beat.event).toBe(true);
    }
  });

  it("AI 額外辨認出、沒有專屬劇情的危險也能演（通用劇情帶入建議）", () => {
    const ev = pickNodeEvent("five-years", [{ key: "balcony", label: "陽台欄杆", level: "high", advice: "欄杆加網子" }], []);
    expect(ev?.beat.lines[0].text).toContain("陽台欄杆");
    expect(ev?.beat.options?.[0].feedback).toBe("欄杆加網子");
  });

  it("所有事件的選項都沒有出現「診斷」「治療」「預防疾病」", () => {
    const evs = ["cable", "cup", "window", "plant", "door"].map(key =>
      pickNodeEvent("five-years", [{ key, label: key, level: "high", advice: "x" }], []));
    const minor = [pickNodeEvent("five-years", [], [], () => 0.1), pickNodeEvent("five-years", [], [], () => 0.9)];
    const text = JSON.stringify([...evs, ...minor, STORY]);
    expect(text).not.toMatch(/診斷|治療|預防疾病/);
  });
});
