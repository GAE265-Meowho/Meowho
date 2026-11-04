import { describe, expect, it } from "vitest";
import { isEnvCheck, startOutcome } from "./home-room";

describe("環境檢查的提醒（規格 09 §7.2）", () => {
  it("還沒選要不要環境檢查就先選", () => {
    expect(startOutcome(null, null)).toEqual({ step: "choose" });
  });
  it("選一起檢查就直接建立", () => {
    expect(startOutcome("wanted", null)).toEqual({ step: "create", envCheck: "wanted" });
  });
  it("選先不要：再提醒一次；改成現在檢查或還是不要都會建立", () => {
    expect(startOutcome("declined", null)).toEqual({ step: "remind" });
    expect(startOutcome("declined", "check")).toEqual({ step: "create", envCheck: "wanted" });
    expect(startOutcome("declined", "skip")).toEqual({ step: "create", envCheck: "declined_again" });
  });
  it("只接受資料庫允許的值", () => {
    expect(isEnvCheck("declined_again")).toBe(true);
    expect(isEnvCheck("maybe")).toBe(false);
  });
});
