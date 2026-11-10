// 貓咪動作庫（規格書 04 §2.6、§8-9）
import { describe, expect, it } from "vitest";
import { buildClipItems, CLIP_LIBRARY, clipPupil, DEFAULT_PUPIL, resolveClip } from "./clips";

describe("resolveClip", () => {
  const have = ["idle", "walk", "sleep"];
  it("指定的動作可播就用它", () => expect(resolveClip("walk", have)).toBe("walk"));
  it("找不到的動作退回 idle，不報錯", () => expect(resolveClip("eat", have)).toBe("idle"));
  it("沒有指定時播 idle", () => expect(resolveClip(null, have)).toBe("idle"));
  it("沒有 idle 就用第一個動作", () => expect(resolveClip("eat", ["walk", "sleep"])).toBe("walk"));
  it("glb 沒有任何動作時回傳 null", () => expect(resolveClip("walk", [])).toBeNull());
});

describe("buildClipItems", () => {
  it("列出動作庫全部動作；glb 有的可播，沒有的不可播", () => {
    const items = buildClipItems(["idle", "walk", "sleep"]);
    expect(items.map(i => i.code)).toEqual(CLIP_LIBRARY.map(c => c.code));
    expect(items.filter(i => i.available).map(i => i.code)).toEqual(["idle", "walk", "sleep"]);
    expect(items.find(i => i.code === "cuddle")).toMatchObject({ status: "ready", available: false, label: "撒嬌" });
  });
  it("動作庫標示 ready 但 glb 裡沒有時不可播", () => {
    expect(buildClipItems(["idle"]).find(i => i.code === "walk")?.available).toBe(false);
  });
  it("跳躍 A、B（#287）：幼貓母體有 jump_a、jump_b 可播，成貓母體還沒有時灰色不可點", () => {
    const kitten = buildClipItems(["idle", "walk", "sleep", "sit", "jump_a", "jump_b"]);
    expect(kitten.find(i => i.code === "jump_a")).toMatchObject({ label: "跳躍-(下往上跳) A", status: "ready", available: true });
    expect(kitten.find(i => i.code === "jump_b")).toMatchObject({ label: "跳躍-(往前跳) B", status: "ready", available: true });
    const adult = buildClipItems(["idle", "walk", "sleep", "sit"]);
    expect(adult.filter(i => i.code.startsWith("jump")).map(i => i.available)).toEqual([false, false, false]);
  });
  it("跳躍 C（#293）：從櫃子往下跳，幼貓母體有 jump_c 可播", () => {
    expect(buildClipItems(["idle", "jump_c"]).find(i => i.code === "jump_c"))
      .toMatchObject({ label: "跳躍-(從櫃子往下跳) C", status: "ready", available: true });
  });
  it("成貓跳躍（#295）：成貓母體有 jump_a、jump_b、jump_c 時三個都可點", () => {
    const adult = buildClipItems(["idle", "walk", "sleep", "sit", "jump_a", "jump_b", "jump_c"]);
    expect(adult.filter(i => i.code.startsWith("jump")).map(i => [i.code, i.available])).toEqual([
      ["jump_a", true], ["jump_b", true], ["jump_c", true],
    ]);
  });
  it("坐下：成貓母體有 sit 可播，幼貓母體沒有時灰色不可點", () => {
    expect(buildClipItems(["idle", "walk", "sleep", "sit"]).find(i => i.code === "sit"))
      .toMatchObject({ label: "坐下", status: "ready", available: true });
    expect(buildClipItems(["idle", "walk", "sleep"]).find(i => i.code === "sit")?.available).toBe(false);
  });
  it("glb 有、動作庫沒登記的動作也列出並可播", () => {
    const extra = buildClipItems(["idle", "stretch"]).find(i => i.code === "stretch");
    expect(extra).toMatchObject({ available: true, label: "stretch" });
  });
});

describe("clipPupil", () => {
  it("幼貓坐下：瞳孔寬窄 0.67", () => expect(clipPupil("sit", "kitten")).toBe(0.67));
  it("成貓坐下維持預設", () => expect(clipPupil("sit", "adult")).toBe(DEFAULT_PUPIL));
  it("沒有指定瞳孔的動作、未登記的動作、沒有動作時都用預設", () => {
    expect(clipPupil("idle", "kitten")).toBe(DEFAULT_PUPIL);
    expect(clipPupil("stretch", "kitten")).toBe(DEFAULT_PUPIL);
    expect(clipPupil(null, "kitten")).toBe(DEFAULT_PUPIL);
  });
  it("吃喝拉撒（#297）：成貓、幼貓母體都有 eat、drink、toilet", () => {
    const items = buildClipItems(["idle", "walk", "eat", "drink", "toilet"]);
    expect(["eat", "drink", "toilet"].map(c => items.find(i => i.code === c))).toEqual([
      expect.objectContaining({ label: "吃飯", status: "ready", available: true }),
      expect.objectContaining({ label: "喝水", status: "ready", available: true }),
      expect.objectContaining({ label: "上廁所", status: "ready", available: true }),
    ]);
  });
  it("撒嬌、休息、理毛（#304）：動作庫已沒有規劃中的動作", () => {
    expect(CLIP_LIBRARY.filter(c => c.status === "planned")).toEqual([]);
    const items = buildClipItems(["cuddle", "rest", "groom"]);
    expect(items.filter(i => ["cuddle", "rest", "groom"].includes(i.code)).map(i => [i.label, i.available]))
      .toEqual([["撒嬌", true], ["休息", true], ["理毛", true]]);
  });

  it("奔跑（#331）：奔跑貓母體有 run 時可點；其他體型標此體型尚無", () => {
    expect(buildClipItems(["run"]).find(i => i.code === "run")).toMatchObject({ label: "奔跑", available: true });
    expect(buildClipItems(["idle", "walk"]).find(i => i.code === "run")).toMatchObject({ available: false, status: "ready" });
  });
});
