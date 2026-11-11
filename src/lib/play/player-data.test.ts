import { describe, expect, it } from "vitest";
import { ageMonths, ageText, bodyOfStage, catKicker, hazardsFromReport, pickReport } from "./player-data";

describe("貓咪年紀", () => {
  it("生日優先，沒有生日用估計月齡", () => {
    const now = new Date("2026-11-10");
    expect(ageMonths({ birthday: "2026-05-10" }, now)).toBe(6);
    expect(ageMonths({ birthday: "2026-05-11" }, now)).toBe(5);
    expect(ageMonths({ est_age_months: 30 }, now)).toBe(30);
    expect(ageMonths({}, now)).toBeNull();
  });
  it("文字", () => {
    expect(ageText(3)).toBe("3 個月");
    expect(ageText(24)).toBe("2 歲");
    expect(ageText(31)).toBe("2 歲多");
    expect(ageText(null, "kitten")).toBe("幼貓");
    expect(ageText(null)).toBe("");
  });
  it("一行摘要略過缺的欄位", () => {
    expect(catKicker({ name: "橘子", coat: "橘貓", ageText: "2 歲" })).toBe("橘子・橘貓・2 歲");
    expect(catKicker({ name: "橘子", coat: null, ageText: "" })).toBe("橘子");
  });
  it("體型", () => {
    expect(bodyOfStage("kitten")).toBe("kitten");
    expect(bodyOfStage(null)).toBe("adult");
  });
});

describe("環境報告 → 危險清單", () => {
  it("note 轉 advice、等級對映、依風險排序", () => {
    const hs = hazardsFromReport([
      { key: "trash", label: "垃圾桶", level: "low", note: "換有蓋的", crop_path: "x" },
      { key: "window", label: "窗戶沒有紗窗", level: "high", note: "裝紗窗" },
      { key: "cable", label: "電線", level: "mid", note: "收線" },
    ]);
    expect(hs?.map(h => h.key)).toEqual(["window", "cable", "trash"]);
    expect(hs?.[1]).toEqual({ key: "cable", label: "電線", level: "medium", advice: "收線" });
    expect(JSON.stringify(hs)).not.toContain("crop");
  });
  it("沒有可用項目回 null", () => {
    expect(hazardsFromReport(null)).toBeNull();
    expect(hazardsFromReport([])).toBeNull();
    expect(hazardsFromReport([{ key: "a", label: "", note: "x" }])).toBeNull();
  });
  it("挑報告：同一間房 ＞ 最新 ready", () => {
    const rows = [
      { room_model_id: "r1", status: "ready", items: [], created_at: "2026-11-01" },
      { room_model_id: "r2", status: "ready", items: [], created_at: "2026-11-05" },
      { room_model_id: "r2", status: "failed", items: [], created_at: "2026-11-09" },
    ];
    expect(pickReport(rows, "r1")?.created_at).toBe("2026-11-01");
    expect(pickReport(rows, null)?.created_at).toBe("2026-11-05");
    expect(pickReport([], "r1")).toBeNull();
  });
});
