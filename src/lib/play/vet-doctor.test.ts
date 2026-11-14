import { describe, expect, it } from "vitest";
import { catSpots, DOCTOR_ARM, doctorAct, solveArm, toDoctorLocal, toWorld, type V3 } from "./vet-doctor";
import { CAT_AT } from "./vet-room";

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("獸醫的手臂（肩、肘兩個關節）", () => {
  it("上臂、前臂長度固定；碰得到的目標手就在目標上", () => {
    const s: V3 = [0.22, 1.18, 0.02];
    for (const t of [[0.3, 0.9, 0.4], [0.26, 0.72, 0.06], [0, 1, 0.5]] as V3[]) {
      const { elbow, hand } = solveArm(s, t, 1);
      expect(dist(s, elbow)).toBeCloseTo(DOCTOR_ARM.upper, 5);
      expect(dist(elbow, hand)).toBeCloseTo(DOCTOR_ARM.fore, 5);
      expect(dist(hand, t)).toBeLessThan(1e-6);
    }
  });

  it("太遠時手臂伸直朝向目標，不會拉長", () => {
    const s: V3 = [0, 1, 0];
    const { hand } = solveArm(s, [0, 1, 3], 1);
    expect(dist(s, hand)).toBeCloseTo(DOCTOR_ARM.upper + DOCTOR_ARM.fore, 2);
    expect(hand[2]).toBeGreaterThan(0.5);
  });

  it("手肘往外側彎（右手往 +x、左手往 −x）", () => {
    const t: V3 = [0.1, 0.9, 0.35];
    expect(solveArm([0.22, 1.18, 0.02], t, 1).elbow[0]).toBeGreaterThan(0.22);
    expect(solveArm([-0.22, 1.18, 0.02], [-0.1, 0.9, 0.35], -1).elbow[0]).toBeLessThan(-0.22);
  });

  it("世界座標與獸醫座標可以互轉", () => {
    const w: V3 = [CAT_AT.x, 1, CAT_AT.z];
    const back = toWorld(toDoctorLocal(w));
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(w[i], 6);
    // 貓在獸醫正前方（local +z）
    const l = toDoctorLocal(w);
    expect(l[2]).toBeGreaterThan(0.4);
    expect(Math.abs(l[0])).toBeLessThan(0.01);
  });
});

describe("看診動作循環", () => {
  for (const body of ["kitten", "adult"] as const) {
    it(`${body}：摸貓、聽診、拍背時手真的碰到貓`, () => {
      const spots = catSpots(body);
      // 每一段動作中間停住的時間點：手要在貓身上（2 公分內）
      const check = (t: number, hand: "left" | "right", spot: V3) => {
        const a = doctorAct(t, { talking: false, still: false, body });
        const s = hand === "right" ? DOCTOR_ARM.shoulderR : DOCTOR_ARM.shoulderL;
        const { hand: h } = solveArm(s, a[hand], hand === "right" ? 1 : -1);
        expect(dist(toWorld(h), spot)).toBeLessThan(0.02);
      };
      expect(doctorAct(1.8, { talking: false, still: false, body }).beat).toBe("pet");
      check(1.8, "right", spots.back);
      expect(doctorAct(7.8, { talking: false, still: false, body }).beat).toBe("listen");
      expect(doctorAct(7.8, { talking: false, still: false, body }).steth).toBe(true);
      check(7.8, "right", spots.flank);
      check(7.8, "left", spots.back);
      expect(doctorAct(11.3, { talking: false, still: false, body }).beat).toBe("pat");
      check(11.3, "right", spots.pat);
    });
  }

  it("動作之間會停一下（手放下）", () => {
    for (const t of [0.5, 5.5, 10]) expect(doctorAct(t, { talking: false, still: false, body: "kitten" }).beat).toBe("rest");
    expect(doctorAct(5.5, { talking: false, still: false, body: "kitten" }).steth).toBe(false);
  });

  it("循環播放（14 秒一輪）", () => {
    const a = doctorAct(1.8, { talking: false, still: false, body: "kitten" });
    const b = doctorAct(1.8 + 14 * 3, { talking: false, still: false, body: "kitten" });
    expect(b.beat).toBe(a.beat);
    for (let i = 0; i < 3; i++) expect(b.right[i]).toBeCloseTo(a.right[i], 6);
  });

  it("獸醫說話時手放下；減少動態時靜止", () => {
    for (const opts of [{ talking: true, still: false }, { talking: false, still: true }]) {
      const a = doctorAct(7.8, { ...opts, body: "kitten" });
      expect(a.beat).toBe("rest");
      expect(a.right).toEqual(DOCTOR_ARM.restR);
      expect(a.left).toEqual(DOCTOR_ARM.restL);
      expect(a.steth).toBe(false);
    }
  });
});
