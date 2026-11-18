import { describe, expect, it } from "vitest";
import { FIRST_CAT_TODO, homeTiles, readinessCounts, SELF_CHECKS, selfChecks, type ReadinessInput } from "./home-readiness";
import type { PlayerHome } from "./background";

const home = (h: Partial<PlayerHome> = {}): PlayerHome => ({ dwelling: "電梯大樓", living: "租屋", family: ["伴侶", "長輩"], pets: [], landlord: "同意", experience: "沒養過貓", sample: false, ...h });
const input = (o: Partial<ReadinessInput> = {}): ReadinessInput => ({ home: home(), allergy: "severe", budget: 3000, monthly: 2850, catName: "麻糬", zoomies: true, ...o });
const tile = (i: ReadinessInput, key: string) => homeTiles(i).find(t => t.key === key)!;

describe("依你家的情況：從喵戶資料看的 6 格", () => {
  it("順序固定，和示範第 4 版一樣：3 項沒問題、2 項要準備、1 項先處理", () => {
    const t = homeTiles(input());
    expect(t.map(x => x.key)).toEqual(["housing", "family", "allergy", "pets", "exp", "budget"]);
    expect(t.map(x => [x.label, x.value, x.status])).toEqual([
      ["房東", "已同意養貓", "ok"], ["同住的人", "有長輩同住", "warn"], ["過敏", "有人症狀明顯", "bad"],
      ["其他寵物", "沒有", "ok"], ["養貓經驗", "第一次養：4 件事先準備", "warn"], ["每月預算", "花費 2,850／預算 3,000", "ok"],
    ]);
  });
  it("房東：不同意要先處理、還在問要準備；不是租屋改看住家", () => {
    expect(tile(input({ home: home({ landlord: "不同意" }) }), "housing").status).toBe("bad");
    expect(tile(input({ home: home({ landlord: "還在問" }) }), "housing").status).toBe("warn");
    expect(tile(input({ home: home({ living: "自有", landlord: null }) }), "housing")).toMatchObject({ label: "住家", value: "自有", status: "ok" });
  });
  it("同住的人：有長輩時提到這次半夜跑酷；自己住沒問題", () => {
    expect(tile(input(), "family").body.join("")).toContain("第 30 天半夜跑酷");
    expect(tile(input({ zoomies: false }), "family").body.join("")).not.toContain("跑酷");
    expect(tile(input({ home: home({ family: [] }) }), "family")).toMatchObject({ value: "自己住", status: "ok" });
  });
  it("過敏：沒有＝沒問題、輕微或不確定＝要準備、還沒填也提醒去補", () => {
    expect(tile(input({ allergy: "none" }), "allergy").status).toBe("ok");
    expect(tile(input({ allergy: "mild" }), "allergy").status).toBe("warn");
    expect(tile(input({ allergy: "unsure" }), "allergy").status).toBe("warn");
    expect(tile(input({ allergy: null }), "allergy")).toMatchObject({ value: "還沒填", status: "warn" });
  });
  it("養貓經驗：第一次養列出遊戲沒演到的 4 件事，生病訊號要具體", () => {
    const t = tile(input(), "exp");
    expect(t.todo).toEqual(FIRST_CAT_TODO);
    expect(t.todo!.map(x => x.head)).toEqual(["晶片和寵物登記", "接回家一週內先健檢", "先找好醫院", "這三種情況要馬上看醫生"]);
    expect(t.todo![3].text).toMatch(/24 小時.*尿不太出來.*張著嘴呼吸/);
    expect(tile(input({ home: home({ experience: "養過 3 年以上" }) }), "exp").status).toBe("ok");
  });
  it("預算：超出就先處理，色條比例最多到 1；沒填要準備", () => {
    const over = tile(input({ budget: 2000, monthly: 2850 }), "budget");
    expect(over.status).toBe("bad");
    expect(over.ratio).toBe(1);
    expect(tile(input({ budget: 0 }), "budget")).toMatchObject({ value: "還沒填", status: "warn" });
  });
});

describe("問問自己（原本的「收養之前，問問自己」併進來）", () => {
  it("5 格，文字照示範", () => {
    expect(SELF_CHECKS.map(c => [c.label, c.value])).toEqual([
      ["急診預備金", "能一次拿出 2～3 萬元嗎"], ["每天的時間", "每天 30～60 分鐘照顧、陪玩"], ["有人幫忙", "出差、旅行、生病時有人照顧牠"],
      ["人生的變化", "交往、結婚、生小孩、搬家都帶著牠"], ["陪牠到老", "牠老了、生病了，陪牠走到最後"],
    ]);
  });
  it("試養沒存醫療預備金時，急診預備金那格多一句", () => {
    expect(selfChecks(true)[0].body).toContain("沒有存醫療預備金");
    expect(selfChecks(false)[0].body).toBe(SELF_CHECKS[0].body);
  });
  it("數量與色條：沒打勾算「還沒回答」，打勾算沒問題；色條先放要處理的", () => {
    const c = readinessCounts(homeTiles(input()), [true, false, false, false, false]);
    expect([c.ok, c.warn, c.bad, c.ask]).toEqual([4, 2, 1, 4]);
    expect(c.bar[0]).toBe("bad");
    expect(c.bar.at(-1)).toBe("ok");
  });
});
