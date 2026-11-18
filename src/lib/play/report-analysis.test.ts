import { describe, expect, it } from "vitest";
import { careEntry, logSkips, type CareEntry } from "./care-log";
import { analyzeReport } from "./report-analysis";
import type { Life } from "./story";

const life = (careLog: CareEntry[], picks: Life["picks"] = []): Pick<Life, "careLog" | "moods" | "picks" | "events"> =>
  ({ careLog, picks, events: [], moods: [{ node: "day1", trust: 30, stress: 40 }, { node: "day3", trust: 38, stress: 34 }] });
const good = { added: 35, total: 35, portion: 35, over: false, spill: 0 };
const day = (node: "day1" | "day3" | "day30" | "month8", water: boolean) => logSkips([
  careEntry(node, "feed", good), careEntry(node, "scoop", { total: 2, bagged: 2 }),
  ...(water ? [careEntry(node, "water", { fill: 80, washed: true })] : []),
], node, ["water"]);

describe("試養報告分析", () => {
  it("每天有沒有做到：✓ △ ✕ 依天排", () => {
    const a = analyzeReport(life([...day("day1", true), ...day("day3", false)]), 2);
    expect(a.days.map(d => d.label)).toEqual(["第 1 天", "第 3 天"]);
    expect(a.strip.find(r => r.act === "water")!.cells.map(c => c.out)).toEqual(["good", "skip"]);
  });
  it("最該注意的一件事：沒做最多的那件，附上為什麼", () => {
    const a = analyzeReport(life([...day("day1", true), ...day("day3", false), ...day("day30", false), ...day("month8", true)]), 2);
    expect(a.focus).toMatchObject({ tone: "bad", big: "2／4 天", title: "換水只做到一半的天數。" });
    expect(a.focus.why).toContain("泌尿道");
    expect(a.dims[0]).toMatchObject({ name: "每天的照顧", score: 83 });
    expect(a.dims[0].how).toContain("換水有 2 天沒做");
  });
  it("四個面向都有「怎麼進步」：技巧看最常見的問題、讀懂牠看跑走被咬血線、選擇看第一個可以再想想的", () => {
    const log = [...day("day1", true),
      careEntry("day1", "feed", { added: 60, total: 60, portion: 35, over: true, spill: 0 }),
      careEntry("day3", "feed", { added: 60, total: 60, portion: 35, over: true, spill: 0 }),
      careEntry("day3", "nail", { score: 70, bleed: true })];
    const a = analyzeReport(life(log, [{ t: "把貓關在房門外", good: false, node: "day30" }, { t: "帶去結紮", good: true, node: "month8" }]), 2);
    const by = Object.fromEntries(a.dims.map(d => [d.key, d]));
    expect(by.skill.how).toContain("看份量條");
    expect(by.read).toMatchObject({ score: 0 });
    expect(by.read.how).toContain("血線");
    expect(by.choice).toMatchObject({ value: "1／2" });
    expect(by.choice.how).toContain("把貓關在房門外");
  });
  it("都做好了：綠色的鼓勵；心情折線有節點名稱", () => {
    const a = analyzeReport(life(day("day1", true)), 2);
    expect(a.focus.tone).toBe("ok");
    expect(a.moods.map(m => m.label)).toEqual(["第 1 天", "第 3 天"]);
  });
  it("舊存檔沒有照顧紀錄也不會壞", () => {
    const a = analyzeReport({ picks: [], events: [] }, 2);
    expect(a.days).toEqual([]);
    expect(a.dims.map(d => d.value)).toEqual(["—", "—", "—", "—"]);
  });
});
