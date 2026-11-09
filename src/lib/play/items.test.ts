// 虛擬飼養：擺進房間的用品。後台有模型就用後台的，沒有就用程式裡寫的。
import { describe, expect, it } from "vitest";
import { PLAY_ITEMS, resolvePlayItems, resolvePlayToy } from "./items";

describe("resolvePlayItems", () => {
  it("後台沒有資料：照程式裡寫的", () => {
    expect(resolvePlayItems({ flags: {}, opts: {}, models: {} })).toEqual(PLAY_ITEMS);
  });
  it("後台有模型就換網址與尺寸，沒有的沿用；順序與名稱不變", () => {
    const out = resolvePlayItems({ flags: {}, opts: {}, models: { bowl: { url: "https://x.test/b.glb", widthM: 0.4, depthM: 0.3, heightM: 0.1 } } });
    expect(out.map(i => i.id)).toEqual(PLAY_ITEMS.map(i => i.id));
    expect(out.find(i => i.id === "bowl")).toMatchObject({ name: "餐碗組", url: "https://x.test/b.glb", widthM: 0.4, depthM: 0.3, heightM: 0.1 });
    expect(out.find(i => i.id === "carrier")).toEqual(PLAY_ITEMS.find(i => i.id === "carrier"));
  });
});

describe("resolvePlayToy", () => {
  it("後台有逗貓棒模型就用後台的，沒有用內建的老鼠", () => {
    expect(resolvePlayToy().url).toContain("87c99fc9");
    const m = { url: "https://x.test/t.glb", widthM: 0.1, depthM: 0.1, heightM: 0.1 };
    expect(resolvePlayToy({ flags: {}, opts: {}, models: { toy: m } })).toEqual(m);
  });
});
