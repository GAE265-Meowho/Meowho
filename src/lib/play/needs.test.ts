import { describe, expect, it } from "vitest";
import { catBubble, homeNeed } from "./needs";

describe("貓頭頂的需求", () => {
  it("一開始最想吃飯，做完一個換下一個，都做完就沒有", () => {
    expect(homeNeed([], true)?.emoji).toBe("🍚");
    expect(homeNeed(["feed"], true)?.emoji).toBe("💧");
    expect(homeNeed(["feed", "water"], true)?.emoji).toBe("💩");
    expect(homeNeed(["feed", "water", "scoop", "play", "pet", "brush", "nail"], true)).toBeNull();
  });
  it("沒有 3D 逗貓的房間不會想玩", () => {
    expect(homeNeed(["feed", "water", "scoop"], false)?.emoji).toBe("💕");
  });
  it("劇情的情緒優先；只有在家的時光、沒在玩小遊戲時才顯示需求", () => {
    expect(catBubble({ storyBub: "heart", home: false, busy: false, done: [], canPlay: true })).toBe("💕");
    expect(catBubble({ storyBub: null, home: false, busy: false, done: [], canPlay: true })).toBeNull();
    expect(catBubble({ storyBub: null, home: true, busy: true, done: [], canPlay: true })).toBeNull();
    expect(catBubble({ storyBub: null, home: true, busy: false, done: [], canPlay: true })).toBe("🍚");
  });
});
