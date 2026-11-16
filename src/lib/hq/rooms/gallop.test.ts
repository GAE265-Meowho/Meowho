import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GALLOP, gallopClip, legOf, quatInterpolant } from "./gallop";

// 假的走路：每條腿的 top1 繞 x 軸擺動，相位照母體的走路（左後 0、左前 0.25、右後 0.5、右前 0.75）
const N = 30;
const swing = (phase: number) => {
  const times: number[] = [], values: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    times.push(t);
    values.push(...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3 * Math.sin(2 * Math.PI * (t - phase))).toArray());
  }
  return { times, values };
};
const legTrack = (bone: string, phase: number) => { const { times, values } = swing(phase); return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values); };
const walk = new THREE.AnimationClip("rig|walk", 1, [
  legTrack("leg_hind_left_top1", 0), legTrack("leg_front_left_top1", 0.25),
  legTrack("leg_hind_right_top1", 0.5), legTrack("leg_front_right_top1", 0.75),
  new THREE.VectorKeyframeTrack("root.position", [0, 1], [0, 0, 0, 0, 0, 0]),
]);

/** 某條腿在 t 秒的擺動角（帶正負號，繞 x 軸） */
const angleAt = (clip: THREE.AnimationClip, bone: string, t: number) => {
  const tr = clip.tracks.find(k => k.name === `${bone}.quaternion`)!;
  const q = new THREE.Quaternion().fromArray(Array.from(quatInterpolant(tr).evaluate(t)));
  return 2 * Math.atan2(q.x, q.w);
};
/** 一圈裡角度最大的時間（換成 0～1 的相位） */
const peak = (clip: THREE.AnimationClip, bone: string) => {
  let best = 0, at = 0;
  for (let i = 0; i < 120; i++) { const t = (i / 120) * clip.duration; const a = angleAt(clip, bone, t); if (a > best) { best = a; at = i / 120; } }
  return { at, best };
};
const gap = (a: number, b: number) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

describe("gallopClip：沒有跑步動作的母體，用走路重組出奔跑（渝茜 2026-11-16：跑酷沒有接到跑步）", () => {
  const run = gallopClip(walk)!;

  it("叫 run、一圈比走路短", () => {
    expect(run.name).toBe("run");
    expect(run.duration).toBeCloseTo(GALLOP.cycleS);
  });

  it("兩隻後腳幾乎一起蹬、兩隻前腳幾乎一起落，前後腳差半圈", () => {
    const lh = peak(run, "leg_hind_left_top1").at, rh = peak(run, "leg_hind_right_top1").at;
    const lf = peak(run, "leg_front_left_top1").at, rf = peak(run, "leg_front_right_top1").at;
    expect(gap(lh, rh)).toBeCloseTo(GALLOP.phase.hind_right, 1);
    expect(gap(lf, rf)).toBeCloseTo(GALLOP.phase.front_right - GALLOP.phase.front_left, 1);
    expect(gap(lh, lf)).toBeCloseTo(0.5, 1);
  });

  it("步伐比走路大（擺動角放大）", () => {
    expect(peak(run, "leg_hind_left_top1").best).toBeCloseTo(0.3 * GALLOP.stride, 2);
  });

  it("不是腿的軌道照抄（壓到一圈的長度）", () => {
    expect(run.tracks.some(t => t.name === "root.position")).toBe(true);
  });

  it("沒有走路腿的動作：null", () => {
    expect(gallopClip(new THREE.AnimationClip("x", 1, [new THREE.VectorKeyframeTrack("root.position", [0, 1], [0, 0, 0, 0, 0, 0])]))).toBeNull();
  });

  it("legOf 認得母體骨頭名稱", () => {
    expect(legOf("leg_hind_left_ankle.quaternion")).toBe("hind_left");
    expect(legOf("leg_front_right_top1.quaternion")).toBe("front_right");
    expect(legOf("tail0.quaternion")).toBeNull();
  });
});
