// 虛擬飼養：在家的時光，小遊戲結果 → 成功與否。結果格式照原版 catgame 的小遊戲。
import { describe, expect, it } from "vitest";
import { careEffect, careGood, careOutcome } from "./care";

describe("careGood", () => {
  it("逗貓：開心分數 50 以上", () => {
    expect(careGood("play", { fun: 60 })).toBe(true);
    expect(careGood("play", { fun: 40 })).toBe(false);
    expect(careGood("play", null)).toBe(false);
  });
  it("鏟屎：每一坨都鏟起來倒掉才算；關掉、沒鏟、只鏟一部分都不算", () => {
    expect(careGood("scoop", { bagged: 6, total: 6 })).toBe(true);
    expect(careGood("scoop", { bagged: 4, total: 6 })).toBe(false);
    expect(careGood("scoop", { bagged: 0, total: 6 })).toBe(false);
    expect(careGood("scoop", { bagged: 0, total: 0 })).toBe(false);  // 今天已經鏟乾淨了，這次沒做事
    expect(careGood("scoop", null)).toBe(false);
    expect(careGood("scoop", {})).toBe(false);
  });
  it("餵貓：倒到線附近、沒倒太多、沒灑出去才算成功", () => {
    expect(careGood("feed", { added: 30, over: false, spill: 0 })).toBe(true);
    expect(careGood("feed", { added: 80, over: true, spill: 0 })).toBe(false);
    expect(careGood("feed", { added: 5, over: false, spill: 0 })).toBe(false);
    expect(careGood("feed", { added: 30, over: false, spill: 3 })).toBe(false);
    expect(careGood("feed", null)).toBe(false);
  });
  it("換水：水裝到 70 以上才算成功；放著不管不算", () => {
    expect(careGood("water", { fill: 85 })).toBe(true);
    expect(careGood("water", { fill: 40 })).toBe(false);
    expect(careGood("water", null)).toBe(false);
  });
  it("剪指甲：沒流血、沒被咬、沒跑掉、剪到 6 成以上", () => {
    expect(careGood("nail", { score: 80, bitten: false, ran: false, bleed: false })).toBe(true);
    expect(careGood("nail", { score: 80, bitten: false, ran: false, bleed: true })).toBe(false);
    expect(careGood("nail", { score: 80, bitten: true, ran: false, bleed: false })).toBe(false);
    expect(careGood("nail", { score: 40, bitten: false, ran: false, bleed: false })).toBe(false);
  });
  it("刷牙：沒被咬、沒跑掉、完成 6 成以上", () => {
    expect(careGood("brush", { score: 70, bitten: false, mode: "brush" })).toBe(true);
    expect(careGood("brush", { score: 70, bitten: true, mode: "brush" })).toBe(false);
    expect(careGood("brush", { score: 20, bitten: false, mode: "touch" })).toBe(false);
    expect(careGood("brush", { score: 80, bitten: false, ran: true, mode: "touch" })).toBe(false);
  });
});

describe("careOutcome：照實判斷做了沒有", () => {
  it("什麼都沒做＝none，只做一部分＝partial", () => {
    expect(careOutcome("scoop", { bagged: 0, total: 6 })).toBe("none");
    expect(careOutcome("scoop", { bagged: 0, total: 0 })).toBe("none");
    expect(careOutcome("scoop", { bagged: 4, total: 6 })).toBe("partial");
    expect(careOutcome("scoop", { bagged: 6, total: 6 })).toBe("good");
    expect(careOutcome("feed", { added: 0, total: 35, over: false, spill: 0 })).toBe("none");
    expect(careOutcome("feed", { added: 5, total: 5, over: false, spill: 0 })).toBe("bad");
    expect(careOutcome("pet", { fun: 0, ran: false })).toBe("none");
    expect(careOutcome("brush", { score: 0, bitten: false, ran: false })).toBe("none");
    expect(careOutcome("nail", { score: 0, bitten: false, ran: false, bleed: false })).toBe("none");
    expect(careOutcome("nail", { score: 0, bitten: true, ran: false, bleed: false })).toBe("bad");
    expect(careOutcome("play", { fun: 0 })).toBe("none");
    expect(careOutcome("water", null)).toBe("none");
  });
  it("餵太少不算吃太多：只有過量才加體重", () => {
    expect(careEffect("feed", false, false, { added: 5, total: 5, over: false }).d).toEqual({});
    expect(careEffect("feed", false, false, { added: 80, total: 80, over: true }).d).toEqual({ weight: 8 });
  });
  it("鏟一部分：衛生照比例加，壓力不降", () => {
    const e = careEffect("scoop", false, false, { bagged: 3, total: 6 });
    expect(e.d).toEqual({ hygiene: 5 });
    expect(e.fx).toEqual({});
  });
});
