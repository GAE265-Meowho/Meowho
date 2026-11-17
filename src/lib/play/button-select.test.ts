// #456：手機長按按鈕會選到字。全站按鈕（button、role=button）要禁止選取與長按選單
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("按鈕不可選取", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const block = css.split(/\n\}\n/).find(b => /button,\s*\n\[role="button"\]/.test(b)) ?? "";
  it("button 與 [role=button] 設了 user-select: none 與 -webkit-touch-callout: none", () => {
    expect(block).toMatch(/user-select:\s*none/);
    expect(block).toMatch(/-webkit-user-select:\s*none/);
    expect(block).toMatch(/-webkit-touch-callout:\s*none/);
  });
});
