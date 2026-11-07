// 虛擬飼養：在家的時光，小遊戲結果 → 成功與否。結果格式照原版 catgame 的小遊戲。
import { describe, expect, it } from "vitest";
import { careGood } from "./care";

describe("careGood", () => {
  it("逗貓：開心分數 50 以上", () => {
    expect(careGood("play", { fun: 60 })).toBe(true);
    expect(careGood("play", { fun: 40 })).toBe(false);
    expect(careGood("play", null)).toBe(false);
  });
  it("鏟屎：一律算做了", () => {
    expect(careGood("scoop", null)).toBe(true);
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
