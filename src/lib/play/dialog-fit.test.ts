import { describe, expect, it } from "vitest";
import { boxInner, chipLabel, estimateTextWidth, fitBudget, healthOwnPage, logSummary, optionPages, packRows, pageBreaks } from "./dialog-fit";

describe("pageBreaks：依可用高度把項目分頁", () => {
  it("放得下就一頁", () => expect(pageBreaks([40, 40, 40], 200, 8)).toEqual([[0, 1, 2]]));
  it("放不下就拆頁，項目之間算間距", () => expect(pageBreaks([40, 40, 40], 90, 8)).toEqual([[0, 1], [2]]));
  it("單一項目比可用高度還高，也自己一頁（不丟掉）", () => expect(pageBreaks([300, 20], 100)).toEqual([[0], [1]]));
  it("沒有項目＝一頁空的", () => expect(pageBreaks([], 100)).toEqual([[]]));
});

describe("packRows：晶片橫排自動換行", () => {
  it("一列塞到滿才換", () => expect(packRows([100, 100, 100], 210, 6)).toEqual([[0, 1], [2]]));
  it("比一列還寬的晶片自己一列", () => expect(packRows([500, 50], 300, 6)).toEqual([[0], [1]]));
});

describe("文字寬度與標籤", () => {
  it("中文一字約一個字級寬、英數約 0.6", () => expect(estimateTextWidth("貓a1", 10)).toBeCloseTo(22));
  it("晶片短句：去掉句尾標點，不截斷內容", () => {
    expect(chipLabel("發生了一次居家意外，帶去看了獸醫。")).toBe("發生了一次居家意外，帶去看了獸醫");
    expect(chipLabel("  每月存醫療預備金  ")).toBe("每月存醫療預備金");
  });
  it("小結只列有的種類", () => {
    expect(logSummary({ event: 0, good: 2, think: 1, note: 0 })).toBe("做得好 2・可以再想想 1");
    expect(logSummary({ event: 1, good: 0, think: 0, note: 3 })).toBe("發生的事 1・紀錄 3");
  });
});

describe("版面估算", () => {
  it("對話框內寬：桌機上限 720、手機上限 640，扣邊框與內距", () => {
    expect(boxInner(1280)).toBe(720 - 48 - 4);
    expect(boxInner(580)).toBe(560 - 32 - 4);
    expect(boxInner(375)).toBe(355 - 32 - 4);
  });
  it("對話框可用高度約畫面四成，矮畫面也至少留一點", () => {
    expect(fitBudget(800)).toBe(320);
    expect(fitBudget(300)).toBeGreaterThanOrEqual(160);
    expect(fitBudget(800, 0.5, 1280)).toBe(448);
    expect(fitBudget(800, 0.5, 580)).toBe(400);
  });
  it("選項：寬的框兩欄、窄的一欄；放不下就分頁", () => {
    const opts = ["先等等", "把牠抱出來", "打開籠門放點零食", "叫全家來看"];
    const wide = optionPages(opts, 600, 400, 17);
    expect(wide.cols).toBe(2);
    expect(wide.pages).toEqual([[0, 1, 2, 3]]);
    const tight = optionPages(opts, 300, 120, 17);
    expect(tight.cols).toBe(1);
    expect(tight.pages.length).toBeGreaterThan(1);
    expect(tight.pages.flat()).toEqual([0, 1, 2, 3]);
  });
});

describe("healthOwnPage：健康聲明太長就自己一頁", () => {
  const long = "僅供參考，非醫療建議。".repeat(10);
  it("寬畫面、短聲明放得下", () => expect(healthOwnPage(1280, 800, "接下來你想怎麼做？", "僅供參考，非醫療建議。")).toBe(false));
  it("手機、長聲明＋選項放不下", () => expect(healthOwnPage(375, 812, "接下來你想怎麼做？", long)).toBe(true));
});
