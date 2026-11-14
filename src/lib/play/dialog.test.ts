import { describe, expect, it } from "vitest";
import { nextBeat, pawSteps, progressLabel, voiceOf } from "./dialog";

describe("劇情對話框：逐句推進", () => {
  it("還有下一句就往下一句，不算看完", () => {
    expect(nextBeat(0, 3)).toEqual({ index: 1, done: false });
    expect(nextBeat(1, 3)).toEqual({ index: 2, done: false });
  });
  it("最後一句再按一次才算看完，index 停在最後一句", () => {
    expect(nextBeat(2, 3)).toEqual({ index: 2, done: true });
  });
  it("沒有句子或 index 超出範圍，直接算看完", () => {
    expect(nextBeat(0, 0)).toEqual({ index: 0, done: true });
    expect(nextBeat(5, 2)).toEqual({ index: 1, done: true });
  });
});

describe("劇情對話框：說話的人", () => {
  it("沒有說話的人、旁白：旁白樣式，沒有頭像與名牌", () => {
    expect(voiceOf(undefined, "妹妹")).toEqual({ narrator: true, name: null, avatar: null });
    expect(voiceOf("旁白", "妹妹")).toEqual({ narrator: true, name: null, avatar: null });
  });
  it("劇本裡的角色用 SPEAKER_NAMES 的名字與各自的頭像", () => {
    expect(voiceOf("clerk", "妹妹")).toEqual({ narrator: false, name: "中途", avatar: "clerk" });
    expect(voiceOf("vet", "妹妹")).toEqual({ narrator: false, name: "林醫師・動物醫院", avatar: "vet" });
    expect(voiceOf("you", "妹妹")).toEqual({ narrator: false, name: "你", avatar: "you" });
    expect(voiceOf("partner", "妹妹").avatar).toBe("partner");
  });
  it("個人化台詞：你、貓、家裡的寵物、同住的人", () => {
    expect(voiceOf("你", "妹妹").avatar).toBe("you");
    expect(voiceOf("妹妹", "妹妹")).toEqual({ narrator: false, name: "妹妹", avatar: "cat" });
    expect(voiceOf("家裡的狗", "妹妹").avatar).toBe("dog");
    expect(voiceOf("家裡的貓", "妹妹").avatar).toBe("cat");
    expect(voiceOf("小孩", "妹妹").avatar).toBe("child");
    expect(voiceOf("長輩", "妹妹").avatar).toBe("elder");
    expect(voiceOf("室友", "妹妹")).toEqual({ narrator: false, name: "室友", avatar: "person" });
  });
});

describe("劇情對話框：節點進度", () => {
  it("走過的、目前的、還沒到的", () => {
    expect(pawSteps(2, 5)).toEqual(["done", "done", "now", "todo", "todo"]);
    expect(pawSteps(0, 2)).toEqual(["now", "todo"]);
  });
  it("讀給螢幕報讀器的文字", () => {
    expect(progressLabel(0, 7)).toBe("節點 1／7");
  });
});
