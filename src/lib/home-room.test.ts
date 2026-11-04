import { describe, expect, it } from "vitest";
import { envNext, isEnvCheck } from "./home-room";

describe("環境檢查的提醒（規格 09 §7.2）：確認影片沒問題後才問", () => {
  it("一起檢查、或提醒後改成現在檢查：建立房間並要做環境檢查", () => {
    expect(envNext("ask", "check")).toEqual({ create: "wanted" });
    expect(envNext("remind", "check")).toEqual({ create: "wanted" });
  });
  it("先不要 → 再提醒一次 → 還是不要 → 告知原始影片會刪除 → 建立房間", () => {
    expect(envNext("ask", "skip")).toEqual({ step: "remind" });
    expect(envNext("remind", "skip")).toEqual({ step: "declined" });
    expect(envNext("declined", "skip")).toEqual({ create: "declined_again" });
  });
  it("只接受資料庫允許的值", () => {
    expect(isEnvCheck("declined_again")).toBe(true);
    expect(isEnvCheck("maybe")).toBe(false);
  });
});
