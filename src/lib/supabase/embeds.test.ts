import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// meow_cats 有兩個外鍵指向 meow_households（所屬喵戶、原中途喵戶，0009），
// 從貓讀喵戶時沒指定外鍵，PostgREST 會因為分不出是哪一個而整筆查詢失敗（#109 上線後的「找不到這隻貓」）
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

describe("從貓讀喵戶都要指定外鍵", () => {
  it("household:meow_households 後面一定接 !meow_cats_household_id_fkey", () => {
    const bad = files("src").filter((p) => {
      const t = readFileSync(p, "utf8");
      return /meow_cats/.test(t) && /household:meow_households(?!!meow_cats_household_id_fkey)[!(]/.test(t);
    });
    expect(bad).toEqual([]);
  });
});
