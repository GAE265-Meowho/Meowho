import { describe, expect, it } from "vitest";
import { careGood } from "@/lib/play/care";
import { LITTER_BOXES, makeClumps, clumpCount, scoopOutcome, newScoop, SCOOP_MAX, SCOOP_TOO_FAST, scoopDone, scoopLoad, scoopResult, scoopStep, type ScoopState } from "./scoop-rules";

/** 固定的亂數，測試才不會時好時壞 */
const seeded = () => { let n = 0; return () => ((n = (n * 9301 + 49297) % 233280) / 233280); };
const fresh = (dirt = 70): ScoopState => newScoop("open", dirt, seeded());
const at = (s: ScoopState, i: number, more: Partial<{ down: boolean; speed: number; vx: number; overBag: boolean }> = {}) =>
  scoopStep(s, "open", { x: s.clumps[i].x, z: s.clumps[i].z, down: true, speed: 0, vx: 0, overBag: false, ...more });
/** 鏟子停在砂盆外的空位左右甩 n 下 */
const shake = (s: ScoopState, n: number) => {
  const events = [];
  for (let i = 0; i <= n; i++) {
    const out = scoopStep(s, "open", { x: 9, z: 9, down: true, speed: 0.6, vx: i % 2 ? 0.6 : -0.6, overBag: false });
    s = out.state; events.push(out.event);
  }
  return { state: s, events };
};

describe("3D 鏟屎規則", () => {
  it("髒的程度決定幾塊，每三塊有一條大便，全部都在盆壁以內；乾淨就沒有", () => {
    const { clumps } = fresh();
    expect(clumps).toHaveLength(6);
    expect(clumps.filter((c) => c.poop)).toHaveLength(2);
    for (const c of clumps) {
      expect(Math.abs(c.x)).toBeLessThan(LITTER_BOXES.open.w / 2);
      expect(Math.abs(c.z)).toBeLessThan(LITTER_BOXES.open.d / 2);
    }
    expect(makeClumps("open", 0)).toHaveLength(0);
    expect(makeClumps("kitten", 100, seeded())).toHaveLength(8);
  });

  it("按著鏟子經過才鏟得起來，沒按著不會", () => {
    expect(at(fresh(), 0, { down: false }).event).toBeNull();
    const picked = at(fresh(), 0);
    expect(picked.event).toBe("pick");
    expect(picked.state.clumps[0].at).toBe("scoop");
    expect(at(fresh(), 2).event).toBe("pickPoop");
  });

  it("鏟子一次最多三塊", () => {
    let s = fresh();
    for (let i = 0; i < s.clumps.length; i++) s = at(s, i).state;
    expect(scoopLoad(s).length).toBe(SCOOP_MAX);
  });

  it("動作太大掉一塊回砂裡；放開時不在垃圾袋上方就全部掉回去", () => {
    let s = at(at(fresh(), 0).state, 1).state;
    const fast = scoopStep(s, "open", { x: 0, z: 0, down: true, speed: SCOOP_TOO_FAST + 1, vx: 0, overBag: false });
    expect(fast.event).toBe("tooFast");
    expect(scoopLoad(fast.state)).toHaveLength(scoopLoad(s).length - 1);  // 只掉一塊，而且這一格不會又鏟起別的
    const dropped = scoopStep(fast.state, "open", { x: 9, z: 9, down: false, speed: 0, vx: 0, overBag: false });
    expect(dropped.event).toBe("dropped");
    expect(scoopLoad(dropped.state)).toHaveLength(0);
    // 掉回去的位置還在砂盆裡
    for (const c of dropped.state.clumps) expect(Math.abs(c.x)).toBeLessThan(LITTER_BOXES.open.w / 2);
    s = dropped.state;
    expect(s.bagged).toBe(0);
  });

  it("拿到垃圾袋上方放開才算清掉；全部清完就結束，結果照 careGood", () => {
    let s = fresh();
    while (!scoopDone(s)) {
      const i = s.clumps.findIndex((c) => c.at === "sand");
      s = shake(at(s, i).state, 3).state;
      const out = scoopStep(s, "open", { x: -0.4, z: 0, down: false, speed: 0, vx: 0, overBag: true });
      expect(out.event).toBe("bagged");
      s = out.state;
    }
    expect(scoopResult(s)).toEqual({ bagged: 6, total: 6, small: false, sandy: 0 });
    expect(careGood("scoop", scoopResult(s))).toBe(true);
  });

  it("鏟子在垃圾袋上方時不會去鏟砂盆裡的東西", () => {
    expect(at(fresh(), 0, { overBag: true }).event).toBeNull();
  });

  it("鏟起來時鏟子上都是砂；左右來回甩三下才乾淨，只往同一邊移不算甩", () => {
    const picked = at(fresh(), 0).state;
    expect(picked.sand).toBe(1);
    let s = picked;
    for (let i = 0; i < 5; i++) s = scoopStep(s, "open", { x: 9, z: 9, down: true, speed: 0.6, vx: 0.6, overBag: false }).state;
    expect(s.sand).toBe(1);
    const two = shake(picked, 2);
    expect(two.state.sand).toBeGreaterThan(0);
    expect(two.events).toContain("shake");
    const three = shake(picked, 3);
    expect(three.state.sand).toBe(0);
    expect(three.events.at(-1)).toBe("sifted");
  });

  it("砂沒甩乾淨就丟：丟得進去，但記成浪費砂", () => {
    const out = scoopStep(at(fresh(), 0).state, "open", { x: -0.4, z: 0, down: false, speed: 0, vx: 0, overBag: true });
    expect(out.event).toBe("baggedSandy");
    expect(out.state.bagged).toBeGreaterThan(0);
    expect(scoopResult(out.state).sandy).toBe(out.state.bagged);
    expect(out.state.sand).toBe(0);
  });

  it("甩得太大力不算甩，東西照樣掉回去", () => {
    const s = at(fresh(), 0).state;
    const a = scoopStep(s, "open", { x: 9, z: 9, down: true, speed: 0.6, vx: -0.6, overBag: false }).state;
    const out = scoopStep(a, "open", { x: 9, z: 9, down: true, speed: SCOOP_TOO_FAST + 1, vx: SCOOP_TOO_FAST + 1, overBag: false });
    expect(out.event).toBe("tooFast");
  });
});

describe("同一天再進來：剩幾坨就幾坨", () => {
  it("newScoop 可以指定剩下的坨數；0 坨＝已經鏟乾淨", () => {
    expect(newScoop("open", 70, Math.random, 2).clumps).toHaveLength(2);
    expect(newScoop("open", 70, Math.random, 0).clumps).toHaveLength(0);
    expect(clumpCount(70)).toBe(6);
  });
  it("scoopOutcome：全鏟、鏟一部分、沒鏟", () => {
    expect(scoopOutcome({ bagged: 6, total: 6 })).toEqual({ kind: "good", left: 0 });
    expect(scoopOutcome({ bagged: 4, total: 6 })).toEqual({ kind: "partial", left: 2 });
    expect(scoopOutcome({ bagged: 0, total: 6 })).toEqual({ kind: "none", left: 6 });
    expect(scoopOutcome(null)).toEqual({ kind: "none", left: null });
  });
});
