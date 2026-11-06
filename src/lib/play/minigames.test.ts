// 虛擬飼養 DEMO（#237）：小遊戲計分
import { describe, expect, it } from "vitest";
import { carrierResult, feedResult, nailResult, pillResult, scoopResult } from "./minigames";

describe("小遊戲計分", () => {
  it("外出籠：沒有急著伸手＝三顆星", () => {
    expect(carrierResult(3, 0).stars).toBe(3);
    expect(carrierResult(1, 2).stars).toBe(1);
  });
  it("放飯：越接近建議份量越好", () => {
    expect(feedResult(16, 16).stars).toBe(3);
    expect(feedResult(21, 16).stars).toBe(2);
    expect(feedResult(40, 16).stars).toBe(0);
    expect(feedResult(30, 16).text).toContain("有點多");
  });
  it("鏟屎：全清完三顆星", () => {
    expect(scoopResult(5, 5).stars).toBe(3);
    expect(scoopResult(2, 5).text).toContain("2／5");
  });
  it("剪指甲：剪太多下牠會跑走", () => {
    expect(nailResult(5, 0, 5).stars).toBe(3);
    expect(nailResult(2, 3, 5).text).toContain("不耐煩");
  });
  it("餵藥：硬塞不給分，結果文字提醒問醫師", () => {
    expect(pillResult("food", true, true).stars).toBe(3);
    expect(pillResult("force", true, true).text).toContain("醫師");
  });
});
