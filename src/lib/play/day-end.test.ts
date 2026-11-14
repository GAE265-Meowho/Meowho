import { describe, expect, it } from "vitest";
import { dayEnd, endsDay } from "./day-end";
import { STORY } from "./story";

const idx = (id: string) => STORY.findIndex(n => n.id === id);

describe("dayEnd：每天結束時中途說的話", () => {
  it("第 1 天結束：說今天是第 1 天、下一站第 3 天，代入貓名", () => {
    const d = dayEnd(idx("day1"), "麻糬")!;
    expect(d.today).toBe("第 1 天");
    expect(d.next).toBe("第 3 天");
    expect(d.title).toBe("今天是第 1 天");
    expect(dayEnd(idx("year5"), "麻糬")!.title).toBe("五年後的這一天");
    expect(d.lines.join("")).toContain("麻糬");
    expect(d.lines.join("")).not.toContain("〈貓名〉");
    expect(d.lines.length).toBe(2);
  });
  it("一直到十年後之前每個節點都有模板", () => {
    for (const id of ["day1", "day3", "day30", "month8", "year5"]) expect(dayEnd(idx(id), "小花")).not.toBeNull();
  });
  it("結尾前（十年後結束）與結尾不跳", () => {
    expect(dayEnd(idx("year10"), "小花")).toBeNull();
    expect(dayEnd(idx("farewell"), "小花")).toBeNull();
  });
  it("句子簡短、不出現數字金額", () => {
    for (const id of ["day1", "day3", "day30", "month8", "year5"]) {
      for (const l of dayEnd(idx(id), "小花")!.lines) { expect(l.length).toBeLessThanOrEqual(40); expect(l).not.toMatch(/元/); }
    }
  });
});

describe("endsDay：這次按下去會不會進下一個節點", () => {
  const base = { step: "node" as const, nodeIndex: idx("day1"), abandoned: false };
  it("在家的時光結束＝一天結束", () => expect(endsDay({ ...base, cur: "home" })).toBe(true));
  it("在家的節點，看完紀錄還要回家照顧，不算", () => expect(endsDay({ ...base, cur: "log" })).toBe(false));
  it("放棄飼養不跳", () => expect(endsDay({ ...base, cur: "home", abandoned: true })).toBe(false));
  it("台詞、選項不算", () => expect(endsDay({ ...base, cur: "lines" })).toBe(false));
});
