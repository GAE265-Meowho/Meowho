import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 渝茜 2026-11-16：看過獸醫之後房間拖不動、逗貓玩具不跟著滑鼠。
// 診間層看完不卸載，隱藏時整層 pointer-events: none，但 react-three-fiber 的畫布外層在行內寫了 pointer-events: auto，
// 子元素明確寫 auto 會蓋過父層的 none，診間的畫布就蓋在房間上面把滑鼠事件全部攔走。
describe("診間隱藏時不擋住房間", () => {
  const css = readFileSync("src/components/play/vet.module.css", "utf8");
  it("隱藏時連裡面的元素（含畫布外層）都不接收滑鼠、手指", () => {
    expect(css).toMatch(/\.vet:not\(\[data-on="true"\]\)\s+\*[^{]*\{[^}]*pointer-events:\s*none\s*!important/);
  });
  it("隱藏時也不佔畫面（看不見、讀屏也略過）", () => {
    expect(css).toMatch(/\.vet:not\(\[data-on="true"\]\)[^{]*\{[^}]*visibility:\s*hidden/);
  });
});
