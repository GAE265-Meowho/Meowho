import { describe, expect, it } from "vitest";
import { careGood } from "@/lib/play/care";
import { clawScore, cutKind, NAIL_COUNT, NAIL_MAX_PULLS, nailClip, nailCutCount, nailDifficulty, nailPress, nailRelease, nailResult, nailStop, nailTick, newNail, pawCoat, type NailState } from "./nail-rules";

const calm = { trust: 80, stress: 20 }, tense = { trust: 15, stress: 85 };
/** 按住一根、剪在 depth */
const cut = (s: NailState, toe: number, depth: number, cat = calm) => nailClip(nailPress(s, toe).state, toe, depth, cat);
const cutAll = (depth: number, cat = calm) => {
  let s = newNail();
  for (let i = 0; i < NAIL_COUNT; i++) s = cut(s, i, depth, cat).state;
  return s;
};

describe("剪指甲規則", () => {
  it("要先按住腳趾指甲才伸出來，沒按住或對錯根都剪不到", () => {
    const s = newNail();
    expect(nailClip(s, 0, 0.3, calm).event).toBe("miss");
    const held = nailPress(s, 1);
    expect(held.event).toBe("press");
    expect(held.state.held).toBe(1);
    expect(nailClip(held.state, 0, 0.3, calm).event).toBe("miss");
    expect(nailClip(held.state, null, 0.3, calm).event).toBe("miss");
    expect(nailRelease(held.state).held).toBeNull();
  });

  it("剪在白色尖端算剛好、太淺只剪到尖端、剪到血線會流血", () => {
    expect(cutKind(0.05)).toBe("tip");
    expect(cutKind(0.35)).toBe("good");
    expect(cutKind(0.8)).toBe("bleed");
    const good = cut(newNail(), 0, 0.35);
    expect(good.event).toBe("good");
    expect(good.state.held).toBeNull();
    const bleed = cut(newNail(), 0, 0.8);
    expect(bleed.event).toBe("bleed");
    expect(bleed.state.bleed).toBe(true);
    expect(bleed.state.resist).toBeGreaterThan(good.state.resist + 30);
  });

  it("剪越準分數越高；剪過的那根不能再按", () => {
    expect(clawScore({ cut: "good", depth: 0.38 })).toBeGreaterThan(clawScore({ cut: "good", depth: 0.16 }));
    expect(clawScore({ cut: "good", depth: 0.16 })).toBeGreaterThan(clawScore({ cut: "tip", depth: 0.05 }));
    expect(clawScore({ cut: "bleed", depth: 0.9 })).toBe(0);
    const s = cut(newNail(), 2, 0.35).state;
    expect(nailPress(s, 2).event).toBe("blocked");
  });

  it("全部剪好就結束，結果符合 careGood；只剪尖端或剪到流血不算做好", () => {
    const done = cutAll(0.38);
    expect(done.end).toBe("done");
    expect(nailCutCount(done)).toBe(NAIL_COUNT);
    expect(nailResult(done)).toEqual({ score: 100, bleed: false, bitten: false, ran: false });
    expect(careGood("nail", nailResult(done))).toBe(true);
    expect(careGood("nail", nailResult(cutAll(0.05)))).toBe(false);
    const bled = cut(cut(newNail(), 0, 0.38).state, 1, 0.9).state;
    expect(nailResult(bled).bleed).toBe(true);
    expect(careGood("nail", nailResult(bled))).toBe(false);
  });

  it("信任低、壓力高的貓比較快不耐煩", () => {
    expect(nailDifficulty(tense).rise).toBeGreaterThan(nailDifficulty(calm).rise * 2);
    const hold = (cat: typeof calm) => nailTick(nailPress(newNail(), 0).state, 2, cat).state.resist;
    expect(hold(tense)).toBeGreaterThan(hold(calm));
  });

  it("按太久貓會抽腳：指甲縮回、暫時按不住；放開會慢慢放鬆", () => {
    let s = nailPress(newNail(), 0).state;
    let event = null;
    for (let i = 0; i < 200 && event !== "pull"; i++) ({ state: s, event } = nailTick(s, 0.1, tense));
    expect(event).toBe("pull");
    expect(s.held).toBeNull();
    expect(s.pulls).toBe(1);
    expect(nailPress(s, 0).event).toBe("blocked");
    const before = s.resist;
    for (let i = 0; i < 20; i++) s = nailTick(s, 0.1, tense).state;
    expect(s.resist).toBeLessThan(before);
    expect(nailPress(s, 0).event).toBe("press");
  });

  it("抽腳超過次數就咬人或跑掉，結果不算做好", () => {
    const run = (rand: () => number) => {
      let s = newNail();
      for (let i = 0; i < 5000 && !s.end; i++) {
        if (s.held === null) s = nailPress(s, 0).state;
        s = nailTick(s, 0.1, tense, rand).state;
      }
      return s;
    };
    const bitten = run(() => 0.1), ran = run(() => 0.9);
    expect(bitten.end).toBe("bitten");
    expect(bitten.pulls).toBe(NAIL_MAX_PULLS);
    expect(nailResult(bitten).bitten).toBe(true);
    expect(ran.end).toBe("ran");
    expect(careGood("nail", nailResult(ran))).toBe(false);
  });

  it("自己停手：照已經剪的算分，之後不能再剪", () => {
    const s = nailStop(cut(newNail(), 0, 0.38).state);
    expect(s.end).toBe("stop");
    expect(nailResult(s).score).toBe(25);
    expect(nailPress(s, 1).event).toBeNull();
    expect(nailTick(s, 1, calm).state).toBe(s);
  });

  it("貓的花色對到五種貓掌毛色，對不到用虎斑", () => {
    expect(pawCoat("橘白")).toBe("orange");
    expect(pawCoat("黑貓")).toBe("black");
    expect(pawCoat("白底虎斑")).toBe("white");
    expect(pawCoat("三花")).toBe("calico");
    expect(pawCoat("虎斑")).toBe("tabby");
    expect(pawCoat(null)).toBe("tabby");
  });
});
