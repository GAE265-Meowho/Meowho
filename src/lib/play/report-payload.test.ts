import { describe, expect, it } from "vitest";
import { buildPlayReport, parsePlayReport } from "./report-payload";
import { newLife } from "./flow";

const life = () => {
  const X = newLife(["沙發", "床"], "橘子");
  X.age = 62; X.trust = 70; X.stress = 20;
  X.picks.push({ t: "砂盆和碗分開放", good: true, node: "day3" }, { t: "拖延結紮", good: false, node: "month8" });
  X.events.push({ node: "year5", id: "incident", t: "居家意外，帶去看了獸醫" });
  X.cost = { once: 2700, month: 24000, med: 3500, acc: 8000, other: 0 };
  X.care.rounds = 6; X.care.log = { play: 5, scoop: 6 };
  return X;
};

describe("試養報告摘要", () => {
  it("只放選擇、花費、照顧紀錄，不放房間物品清單", () => {
    const r = buildPlayReport({ life: life(), startMonths: 2, budget: 3000, monthly: 2000 });
    expect(r).toMatchObject({ v: 1, catName: "橘子", years: 5, trust: 70, budget: 3000, monthly: 2000, overBudget: false });
    expect(r.cost.total).toBe(2700 + 24000 + 3500 + 8000);
    expect(r.picks).toEqual([{ t: "砂盆和碗分開放", good: true }, { t: "拖延結紮", good: false }]);
    expect(JSON.stringify(r)).not.toContain("沙發");
    expect(r.care.log).toEqual({ play: 5, scoop: 6 });
  });
  it("超過預算", () => {
    expect(buildPlayReport({ life: life(), startMonths: 2, budget: 1500, monthly: 2000 }).overBudget).toBe(true);
    expect(buildPlayReport({ life: life(), startMonths: 2, budget: 0, monthly: 2000 }).overBudget).toBe(false);
  });
  it("存進去再讀回來一樣；壞資料回 null 或補預設", () => {
    const r = buildPlayReport({ life: life(), startMonths: 2, budget: 3000, monthly: 2000 });
    expect(parsePlayReport(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(parsePlayReport(null)).toBeNull();
    expect(parsePlayReport([])).toBeNull();
    expect(parsePlayReport({ v: 2, catName: "x" })).toBeNull();
    expect(parsePlayReport({ v: 1, catName: "橘子", picks: "壞的", cost: 5 })?.picks).toEqual([]);
  });
});
