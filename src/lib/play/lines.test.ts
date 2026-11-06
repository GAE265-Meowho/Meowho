// 虛擬飼養 DEMO（#237）：個人化台詞與報告建議——AI 回傳檢查、規則備案
import { describe, expect, it } from "vitest";
import { SAMPLE_HOME, type PlayerHome } from "./background";
import { allowedSpeakers, checkLines, ruleLines, type LinesContext } from "./lines";
import { checkAdvice, ruleAdvice } from "./report";

const home: PlayerHome = { dwelling: "公寓", living: "租屋", family: ["小孩"], pets: ["狗"], sample: false };
const ctx = (over: Partial<LinesContext> = {}): LinesContext => ({
  nodeId: "first-day", catName: "麻糬", home, labels: ["沙發"], ...over,
});

describe("checkLines（AI 台詞檢查）", () => {
  it("合格：說話的人在清單裡、長度合理", () => {
    const out = checkLines({ lines: [{ speaker: "小孩", text: "牠的尾巴好像虎斑條紋的毛筆！" }, { speaker: "旁白", text: "麻糬眨了眨眼。" }] }, ctx());
    expect(out).toHaveLength(2);
  });
  it("說話的人不在清單裡（例如鄰居）就不收", () => {
    expect(checkLines({ lines: [{ speaker: "鄰居", text: "好可愛" }] }, ctx())).toBeNull();
  });
  it("太長、太多句、含數字、空的都不收", () => {
    expect(checkLines({ lines: [{ speaker: "旁白", text: "長".repeat(81) }] }, ctx())).toBeNull();
    expect(checkLines({ lines: Array(5).fill({ speaker: "旁白", text: "喵喵叫" }) }, ctx())).toBeNull();
    expect(checkLines({ lines: [{ speaker: "旁白", text: "一個月要花 3000 元" }] }, ctx())).toBeNull();
    expect(checkLines({ lines: [] }, ctx())).toBeNull();
    expect(checkLines("不是物件", ctx())).toBeNull();
  });
  it("說話的人包含原有寵物（家裡的狗）", () => {
    expect(allowedSpeakers({ catName: "麻糬", home })).toEqual(expect.arrayContaining(["旁白", "你", "麻糬", "小孩", "家裡的狗"]));
  });
});

describe("ruleLines（規則備案）", () => {
  it("三個節點都產生得出來，且本身就通過檢查", () => {
    for (const nodeId of ["first-day", "five-years", "farewell"] as const) {
      for (const h of [home, SAMPLE_HOME, { ...SAMPLE_HOME, family: [], pets: [] }]) {
        const lines = ruleLines(ctx({ nodeId, home: h }));
        expect(lines.length).toBeGreaterThan(0);
        expect(checkLines({ lines }, { catName: "麻糬", home: h })).not.toBeNull();
      }
    }
  });
  it("有狗、有小孩：第一天的台詞提到牠們", () => {
    const text = ruleLines(ctx()).map(l => l.text).join("");
    expect(text).toContain("狗");
    expect(text).toContain("小孩");
  });
});

describe("報告建議", () => {
  const base = { catName: "麻糬", home, hazards: [{ key: "cable", label: "電線與插座", level: "high" as const, advice: "收好" }], handled: [], choices: [], overBudget: true };
  it("規則建議會提到沒處理的危險與超支", () => {
    const tips = ruleAdvice(base);
    expect(tips.join("")).toContain("電線與插座");
    expect(tips.join("")).toContain("預算");
    expect(checkAdvice({ tips })).not.toBeNull();
  });
  it("AI 建議含數字或格式不對就不收", () => {
    expect(checkAdvice({ tips: ["每個月存 500 元", "多陪牠玩"] })).toBeNull();
    expect(checkAdvice({ tips: ["只有一條建議"] })).toBeNull();
    expect(checkAdvice({ tips: ["先把電線收好再接貓回家", "和家人分配照顧工作"] })).toHaveLength(2);
  });
});
