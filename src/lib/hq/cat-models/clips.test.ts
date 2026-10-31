// 貓咪動作庫（規格書 04 §2.6、§8-9）
import { describe, expect, it } from "vitest";
import { buildClipItems, CLIP_LIBRARY, resolveClip } from "./clips";

describe("resolveClip", () => {
  const have = ["idle", "walk", "sleep"];
  it("指定的動作可播就用它", () => expect(resolveClip("walk", have)).toBe("walk"));
  it("找不到的動作退回 idle，不報錯", () => expect(resolveClip("eat", have)).toBe("idle"));
  it("沒有指定時播 idle", () => expect(resolveClip(null, have)).toBe("idle"));
  it("沒有 idle 就用第一個動作", () => expect(resolveClip("eat", ["walk", "sleep"])).toBe("walk"));
  it("glb 沒有任何動作時回傳 null", () => expect(resolveClip("walk", [])).toBeNull());
});

describe("buildClipItems", () => {
  it("列出動作庫全部動作；glb 有的 ready 動作可播，規劃中的不可播", () => {
    const items = buildClipItems(["idle", "walk", "sleep"]);
    expect(items.map(i => i.code)).toEqual(CLIP_LIBRARY.map(c => c.code));
    expect(items.filter(i => i.available).map(i => i.code)).toEqual(["idle", "walk", "sleep"]);
    expect(items.find(i => i.code === "eat")).toMatchObject({ status: "planned", available: false, label: "吃飯" });
  });
  it("母體 glb 補入規劃中的動作後，清單自動可點，不必先改動作庫", () => {
    const eat = buildClipItems(["idle", "walk", "sleep", "eat"]).find(i => i.code === "eat");
    expect(eat).toMatchObject({ status: "planned", available: true });
  });
  it("動作庫標示 ready 但 glb 裡沒有時不可播", () => {
    expect(buildClipItems(["idle"]).find(i => i.code === "walk")?.available).toBe(false);
  });
  it("glb 有、動作庫沒登記的動作也列出並可播", () => {
    const extra = buildClipItems(["idle", "stretch"]).find(i => i.code === "stretch");
    expect(extra).toMatchObject({ available: true, label: "stretch" });
  });
});
