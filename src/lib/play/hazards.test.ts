// 虛擬飼養 DEMO（#237）：居家危險的規則對照（AI 失敗時的備案）與 AI 結果整理
import { describe, expect, it } from "vitest";
import { cleanAiHazards, ruleHazards, HAZARD_RULES } from "./hazards";

describe("ruleHazards（規則對照）", () => {
  it("電線、電腦、電視 → 咬電線；桌子＋杯子 → 推倒水杯；有窗 → 窗戶防護", () => {
    const keys = ruleHazards({ labels: ["電腦", "茶几", "水杯", "沙發"], hasWindow: true }).map(h => h.key);
    expect(keys).toEqual(expect.arrayContaining(["cable", "cup", "window"]));
  });

  it("只有杯子沒有桌子不算推倒水杯；沒有窗不提醒窗戶", () => {
    const keys = ruleHazards({ labels: ["水杯", "床"], hasWindow: false }).map(h => h.key);
    expect(keys).not.toContain("cup");
    expect(keys).not.toContain("window");
  });

  it("延長線也算電線；花瓶、植物只提示查證，不說一定有毒", () => {
    const hs = ruleHazards({ labels: ["延長線", "盆栽"], hasWindow: false });
    expect(hs.map(h => h.key)).toEqual(expect.arrayContaining(["cable", "plant"]));
    expect(hs.find(h => h.key === "plant")!.advice).toContain("查證");
  });

  it("什麼都沒辨認到時至少給一項通用提醒", () => {
    expect(ruleHazards({ labels: [], hasWindow: false }).length).toBeGreaterThan(0);
  });

  it("每條規則都有等級與建議，依等級排序（high 在前）", () => {
    for (const r of HAZARD_RULES) expect(["high", "medium", "low"]).toContain(r.level);
    const hs = ruleHazards({ labels: ["電腦", "花瓶", "門"], hasWindow: true });
    const order = { high: 0, medium: 1, low: 2 };
    expect(hs.map(h => order[h.level])).toEqual([...hs.map(h => order[h.level])].sort());
  });
});

describe("cleanAiHazards（AI 回傳整理）", () => {
  it("對得到規則的 key 用規則的名稱；新項目保留；去掉數字與重複", () => {
    const out = cleanAiHazards([
      { key: "cable", label: "電腦電線", level: "high", advice: "把電線收好" },
      { key: "cable", label: "重複", level: "low", advice: "x" },
      { key: "balcony", label: "陽台欄杆", level: "high", advice: "欄杆間距太寬時加網子" },
      { key: "money", label: "買防護網要 500 元", level: "low", advice: "花 500 元" },
    ]);
    expect(out?.map(h => h.key)).toEqual(["cable", "balcony"]);
    expect(out?.[0].label).toBe("電線與插座");
  });

  it("空陣列回 null（改用規則）", () => {
    expect(cleanAiHazards([])).toBeNull();
  });
});
