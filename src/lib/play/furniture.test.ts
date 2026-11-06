// 虛擬飼養 DEMO（#237）：〈通稱〉換成房間家具（照 catgame 原版 FURN_WORD／homeWord／fullTx）
import { describe, expect, it } from "vitest";
import { fullTx, homeHas, homeWord } from "./furniture";
import { DEMO_DOLLHOUSE, inventoryFromPlan } from "./room";

const demo = inventoryFromPlan(DEMO_DOLLHOUSE).labels;

describe("homeWord", () => {
  it("照原版順序挑家裡第一個有的家具：範例房間（子哲的家）有床，躲藏處＝床底；沒有床有沙發就是沙發底下", () => {
    expect(homeWord("躲藏處", demo)).toBe("床底");
    expect(homeWord("躲藏處", ["沙發", "書桌"])).toBe("沙發底下");
    expect(homeWord("躲藏處", ["床", "沙發"])).toBe("床底");
    expect(homeWord("高處", demo)).toBe("床");
    expect(homeWord("桌面", demo)).toBe("書桌");
    expect(homeWord("門口", demo)).toBe("房門");
    expect(homeWord("門口", [...demo, "門"])).toBe("大門");
  });
  it("清單裡的 \"\" 代表一定有；都沒有回 null", () => {
    expect(homeWord("躲藏處", [])).toBe("角落");
    expect(homeWord("可關門的房間", demo)).toBeNull();
    expect(homeWord("可關門的房間", ["臥室"])).toBe("另一個房間");
  });
  it("homeHas：電腦、電視、延長線都算電線", () => {
    expect(homeHas("cable", ["電腦"])).toBe(true);
    expect(homeHas("cable", ["沙發"])).toBe(false);
  });
});

describe("fullTx", () => {
  it("換掉〈通稱〉；找不到的寫「家裡」", () => {
    expect(fullTx("鑽進了〈躲藏處〉", ["床"])).toBe("鑽進了床底");
    expect(fullTx("關在〈可關門的房間〉", [])).toBe("關在家裡");
  });
});
