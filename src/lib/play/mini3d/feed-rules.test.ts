import { describe, expect, it } from "vitest";
import { careGood } from "@/lib/play/care";
import { addCan, CAN_LANDS, canFrame, feedAmount, feedHint, feedPortion, feedResult, newFeed, pourDry, type FeedState } from "./feed-rules";

const pour = (s: FeedState, seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += 0.05) s = pourDry(s, 0.05); return s; };

describe("3D 餵貓規則", () => {
  it("建議份量：結紮後比較少，偏胖再少一點", () => {
    expect(feedPortion({ cat: { body: 5 } })).toBe(35);
    expect(feedPortion({ neutered: true, cat: { body: 5 } })).toBe(28);
    expect(feedPortion({ neutered: true, cat: { body: 7 } })).toBe(24);
  });

  it("乾飼料倒到建議份量附近算餵好，結果格式照 careGood", () => {
    const portion = 35;
    expect(careGood("feed", feedResult(pour(newFeed(), 0.5), portion))).toBe(false);  // 11，太少
    const ok = feedResult(pour(newFeed(), 1.6), portion);
    expect(ok).toMatchObject({ added: 35, over: false, wet: false, soup: false, spill: 0 });
    expect(careGood("feed", ok)).toBe(true);
  });

  it("倒超過建議份量的一倍半算餵過量", () => {
    const r = feedResult(pour(newFeed(), 2.6), 35);  // 57
    expect(r.over).toBe(true);
    expect(careGood("feed", r)).toBe(false);
    expect(feedHint(pour(newFeed(), 2.6), 35, true)).toContain("過量");
  });

  it("主食罐、湯罐各只算一次，和乾飼料加在一起", () => {
    let s = addCan(addCan(pour(newFeed(), 0.5), "wet"), "wet");
    expect(feedAmount(s)).toBeCloseTo(41);
    s = addCan(s, "soup");
    expect(feedResult(s, 35)).toMatchObject({ added: 51, wet: true, soup: true, over: false });
  });

  it("碗滿了還在倒就灑出去，灑太久不算餵好；一次跳很久也只算 0.1 秒", () => {
    expect(pourDry(newFeed(), 60).dry).toBeCloseTo(2.2);
    const s = pour(newFeed(), 7);
    expect(feedAmount(s)).toBe(100);
    expect(s.spill).toBeGreaterThan(1.5);
    expect(feedHint(s, 35, true)).toContain("灑");
  });
});

describe("開罐頭的動作順序", () => {
  const frames = Array.from({ length: 201 }, (_, i) => ({ k: i / 200, ...canFrame(i / 200) }));

  it("開始和結束時右手都拿著飼料袋在碗旁邊，罐頭不在畫面裡", () => {
    for (const k of [0, 1]) expect(canFrame(k)).toMatchObject({ bagHand: 1, canIn: 0, tabHand: 0, tilt: 0 });
  });

  it("右手先放下飼料袋，才空手去拉拉環", () => {
    for (const f of frames) if (f.tabHand > 0) expect(f.bagHand).toBe(0);
  });

  it("蓋子拉開了才倒，罐頭傾斜夠了內容才落下", () => {
    for (const f of frames) {
      if (f.tilt > 0) expect(f.lid).toBe(1);
      if (f.drop > 0 && f.drop < 1) expect(f.tilt).toBeGreaterThan(0.5);
    }
    expect(canFrame(CAN_LANDS).drop).toBe(1);
  });
});
