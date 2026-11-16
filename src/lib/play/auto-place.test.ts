import { describe, expect, it } from "vitest";
import { autoSpot, showMoveHint } from "./auto-place";

const spots = [{ label: "床旁" }, { label: "鞋子旁" }, { label: "房間角落" }];

describe("autoSpot：點用品就自動放的位置（渝茜 2026-11-16）", () => {
  it("挑第一個還沒被別的用品佔走的位置", () => {
    expect(autoSpot(spots, [])).toBe("床旁");
    expect(autoSpot(spots, ["床旁"])).toBe("鞋子旁");
    expect(autoSpot(spots, ["床旁", undefined, "鞋子旁"])).toBe("房間角落");
  });
  it("全部都被佔走：退回最後一個（房間角落），不會沒地方放", () => {
    expect(autoSpot(spots, ["床旁", "鞋子旁", "房間角落"])).toBe("房間角落");
  });
  it("沒有任何位置：null", () => {
    expect(autoSpot([], [])).toBeNull();
  });
});

describe("showMoveHint：「點選移動」提示框", () => {
  it("自動放了東西、玩家還沒關過提示才顯示", () => {
    expect(showMoveHint({ autoPlaced: true, dismissed: false })).toBe(true);
    expect(showMoveHint({ autoPlaced: true, dismissed: true })).toBe(false);
    expect(showMoveHint({ autoPlaced: false, dismissed: false })).toBe(false);
  });
});
