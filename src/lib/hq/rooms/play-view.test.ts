import { describe, expect, it } from "vitest";
import { PLAY_VIEW, playFov, playView } from "./overview";

describe("虛擬飼養的一般鏡頭（離開俯視後）", () => {
  it("拍攝點太低、往下看：往後退、抬到最低高度，還看著原本畫面中間那點", () => {
    const v = playView([2, 0.6, 2], [0, -0.6, 0.8]);
    expect(v.pos[1]).toBeCloseTo(PLAY_VIEW.minHeightM);
    expect(v.pos[2]).toBeCloseTo(2 - PLAY_VIEW.backM);
    expect(v.pos[0]).toBeCloseTo(2);
    // 原本畫面中間那點在新視線上
    const aim = [2, 0.6 - 0.6 * PLAY_VIEW.aimM, 2 + 0.8 * PLAY_VIEW.aimM];
    const to = aim.map((a, i) => a - v.pos[i]);
    const l = Math.hypot(...to);
    to.forEach((t, i) => expect(t / l).toBeCloseTo(v.dir[i]));
  });

  it("拍攝點夠高就不再抬高，正下方看時往預設方向退", () => {
    expect(playView([0, 2, 0], [1, 0, 0]).pos).toEqual([-PLAY_VIEW.backM, 2, 0]);
    expect(playView([0, 2, 0], [0, -1, 0]).pos[2]).toBeCloseTo(-PLAY_VIEW.backM);
  });

  it("視野放大 30%，有上限", () => {
    expect(playFov(50)).toBeCloseTo(65);
    expect(playFov(75)).toBe(PLAY_VIEW.maxFov);
  });
});
