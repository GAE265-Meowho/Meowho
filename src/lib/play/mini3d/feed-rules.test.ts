import { describe, expect, it } from "vitest";
import { careGood } from "@/lib/play/care";
import { addCan, CAN_LANDS, canFits, canFrame, feedAmount, feedHint, feedPortion, feedResult, newFeed, pourDry, type FeedState } from "./feed-rules";

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

  it("主食罐一罐就夠一餐；湯罐一罐不夠、要兩罐；可以連開好幾罐", () => {
    const wet = addCan(newFeed(), "wet");
    expect(feedResult(wet, 35)).toMatchObject({ added: 30, wet: true, soup: false, over: false });
    expect(careGood("feed", feedResult(wet, 35))).toBe(true);
    expect(feedHint(wet, 35, false)).toContain("差不多");
    const soup = addCan(newFeed(), "soup");
    expect(careGood("feed", feedResult(soup, 35))).toBe(false);
    expect(feedHint(soup, 35, false)).toContain("再開一罐");
    expect(careGood("feed", feedResult(addCan(soup, "soup"), 35))).toBe(true);
    expect(feedResult(addCan(wet, "wet"), 35)).toMatchObject({ added: 60, over: true });
  });

  it("碗放不下就不能再開罐頭", () => {
    let s = newFeed();
    for (let i = 0; i < 5; i++) s = addCan(s, "wet");
    expect(s.wet).toBe(3);
    expect(canFits(s, "wet")).toBe(false);
    expect(canFits(s, "soup")).toBe(true);
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

  it("開始和結束時左手都拿著沒開過的罐頭在碗上方，右手不在", () => {
    for (const k of [0, 1]) expect(canFrame(k)).toEqual({ canIn: 1, tabHand: 0, lid: 0, tilt: 0, drop: k });
  });

  it("蓋子拉開了才倒，罐頭傾斜夠了內容才落下", () => {
    for (const f of frames) {
      if (f.tilt > 0) expect(f.lid).toBe(1);
      if (f.drop > 0 && f.drop < 1) expect(f.tilt).toBeGreaterThan(0.5);
    }
    expect(canFrame(CAN_LANDS).drop).toBe(1);
  });

  it("倒完扶正後左手才退出去；罐頭在畫面外時換成沒開過的", () => {
    for (const f of frames) if (f.canIn < 1) expect(f.tilt).toBe(0);
    const away = frames.reduce((a, b) => (b.canIn < a.canIn ? b : a));
    expect(away.canIn).toBeLessThan(0.01);
    expect(frames.filter((f) => f.k > away.k).every((f) => f.lid === 0)).toBe(true);
  });
});
