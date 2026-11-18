import { describe, expect, it } from "vitest";
import { careEntry, logCare, logSkips, parseCareLog } from "./care-log";

describe("照顧紀錄：每個決定都記下來（渝茜 2026-11-18）", () => {
  it("餵飯：記倒了建議份量的幾 %、倒太多、灑出來、倒太少", () => {
    expect(careEntry("day1", "feed", { added: 35, total: 35, portion: 35, over: false, spill: 0 })).toMatchObject({ out: "good", d: "份量剛好（建議份量的 100%）", pct: 100 });
    expect(careEntry("day1", "feed", { added: 60, total: 60, portion: 35, over: true, spill: 0 })).toMatchObject({ out: "meh", d: "倒太多（建議份量的 171%）" });
    expect(careEntry("day1", "feed", { added: 50, total: 50, portion: 35, over: false, spill: 2 }).d).toContain("灑出來");
    expect(careEntry("day1", "feed", { added: 20, total: 20, portion: 35, over: false, spill: 0 })).toMatchObject({ out: "meh", d: "倒太少（建議份量的 57%）" });
    expect(careEntry("day1", "feed", { added: 0, total: 0, portion: 35 }).out).toBe("skip");
  });
  it("換水：沒刷碗、水不夠都是△", () => {
    expect(careEntry("day3", "water", { fill: 80, washed: true }).out).toBe("good");
    expect(careEntry("day3", "water", { fill: 80, washed: false }).d).toBe("換了新水，但碗沒刷乾淨");
    expect(careEntry("day3", "water", { fill: 40, washed: true }).d).toBe("水只裝到 40%");
  });
  it("鏟屎記剩幾坨；剪指甲、刷牙、摸貓記牠跑走、被咬、血線", () => {
    expect(careEntry("day3", "scoop", { total: 3, bagged: 1 }).d).toBe("還有 2 坨沒鏟");
    expect(careEntry("day30", "nail", { score: 70, bleed: true })).toMatchObject({ out: "meh", hurt: true, d: "剪到血線，流血了" });
    expect(careEntry("day30", "brush", { score: 20, bitten: true }).hurt).toBe(true);
    expect(careEntry("day30", "pet", { fun: 10, ran: true }).hurt).toBe(true);
  });
  it("打開後關掉＝沒做", () => {
    expect(careEntry("day1", "water", null)).toMatchObject({ out: "skip", d: "打開後關掉了" });
  });
  it("同一天同一個動作只留做得最好的一次，跑走、被咬會留著", () => {
    let log = logCare([], careEntry("day3", "pet", { fun: 10, ran: true }));
    log = logCare(log, careEntry("day3", "pet", { fun: 80 }));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ out: "good", hurt: true });
    log = logCare(log, careEntry("day3", "pet", null));
    expect(log[0].out).toBe("good");
  });
  it("一天結束：沒做的動作記「沒做」，做過的不重複", () => {
    const log = logSkips([careEntry("day3", "feed", { added: 35, total: 35, portion: 35 })], "day3", ["feed", "water"]);
    expect(log.map(x => [x.act, x.out])).toEqual([["feed", "good"], ["water", "skip"]]);
  });
  it("讀存檔只留格式對的", () => {
    expect(parseCareLog([{ node: "day1", act: "feed", out: "good", d: "x" }, { node: 1 }, null])).toHaveLength(1);
    expect(parseCareLog("x")).toEqual([]);
  });
});
