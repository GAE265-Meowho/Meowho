// #456：手機與電腦的操作說明分開
import { describe, expect, it } from "vitest";
import { CONTROL_TEXT, controlText } from "./control-text";

describe("controlText", () => {
  it("手機挑 touch、電腦挑 desktop；沒寫 touch 就用 desktop", () => {
    expect(controlText({ desktop: "滑鼠", touch: "手指" }, true)).toBe("手指");
    expect(controlText({ desktop: "滑鼠", touch: "手指" }, false)).toBe("滑鼠");
    expect(controlText({ desktop: "都一樣" }, true)).toBe("都一樣");
  });
  it("每個小遊戲的說明：手機版不講滑鼠、鍵盤，電腦版不講手指", () => {
    for (const [id, t] of Object.entries(CONTROL_TEXT)) {
      const touch = (t as { touch?: string }).touch ?? "";
      expect(touch, `${id} 手機版`).not.toMatch(/滑鼠|鍵盤|空白鍵|方向鍵/);
      expect(t.desktop, `${id} 電腦版`).not.toMatch(/手指/);
    }
  });
});
