import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRAILER_MD } from "./trailer-md.generated";
import { CHARACTERS, SCENES } from "./trailer";

const doc = readFileSync(join(process.cwd(), "docs/video/前導影片分鏡腳本_v3.md"), "utf8");

describe("前導影片腳本下載（#498）", () => {
  it("下載的內容和 docs/video 原稿一致（沒同步就跑 npm run video:md）", () => {
    expect(TRAILER_MD).toBe(doc);
  });

  it("原稿的角色／定景 prompt 和頁面資料一致", () => {
    for (const r of [...CHARACTERS, ...SCENES]) expect(doc, r.id).toContain(r.prompt);
  });
});
