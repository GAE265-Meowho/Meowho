import { describe, expect, it } from "vitest";
import { MIC_UNSUPPORTED, micErrorMessage } from "./speech";

describe("語音輸入錯誤訊息", () => {
  it("權限被拒要教使用者去哪裡打開，而不是說「沒聽清楚」", () => {
    for (const r of ["not-allowed", "service-not-allowed"]) {
      expect(micErrorMessage(r)).toContain("麥克風權限");
      expect(micErrorMessage(r)).not.toContain("沒有聽清楚");
    }
  });
  it("各種原因給不同訊息", () => {
    const msgs = ["audio-capture", "no-speech", "network", "language-not-supported", "unknown"].map(micErrorMessage);
    expect(new Set(msgs).size).toBe(5);
    expect(micErrorMessage("audio-capture")).toContain("找不到麥克風");
    expect(micErrorMessage("network")).toContain("網路");
  });
  it("使用者自己停止（aborted）不顯示錯誤", () => expect(micErrorMessage("aborted")).toBe(""));
  it("沒有原因時走預設訊息", () => expect(micErrorMessage(undefined)).toContain("改用打字"));
  it("不支援時提示換瀏覽器", () => expect(MIC_UNSUPPORTED).toContain("Chrome"));
});
