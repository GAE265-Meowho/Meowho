import { describe, expect, it } from "vitest";
import { mainRegion } from "./regions";

/** 用字串畫網格：. 能走、# 不能走 */
const grid = (...rows: string[]) => ({ nx: rows[0].length, walkable: [...rows.join("")].map((c) => (c === "." ? 1 : 0)) });

describe("mainRegion", () => {
  it("只留最大那塊相連地板，被家具圍住的小角落不算", () => {
    const { nx, walkable } = grid(
      "..#...",
      "..#...",
      "###...",
    );
    expect(mainRegion(walkable, nx)).toEqual([3, 4, 5, 9, 10, 11, 15, 16, 17]);
  });

  it("左右邊界不會接到下一列；斜角不算相連", () => {
    // 第一列最後一格和第二列第一格編號相鄰（1、2），但不相連
    expect(mainRegion(grid("#.", ".#").walkable, 2)).toHaveLength(1);
    expect(mainRegion(grid(".#", "#.").walkable, 2)).toHaveLength(1);
  });

  it("沒有能走的格子就回空的", () => {
    expect(mainRegion(grid("##").walkable, 2)).toEqual([]);
  });
});
