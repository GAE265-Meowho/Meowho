// 跑步動作（渝茜 2026-11-16：「跑酷好像沒有接到跑步的動作」）。
// 成貓、幼貓母體（base_clips*.glb）只有 walk 沒有 run，cat.js 衝刺時只能把走路加速播放（最多 3 倍），看起來像快走。
// 這裡用同一副骨架的走路重組出奔跑：走路是四拍（左後 → 左前 → 右後 → 右前，各差 1/4 圈），
// 奔跑改成兩隻後腳幾乎一起蹬、兩隻前腳幾乎一起落、前後差半圈，一圈縮短、擺動角放大。
// 每條腿用自己原本的軌道（左右骨頭的軸向不一定對稱，不能互抄），只把取樣的時間錯開。
import * as THREE from "three";

export type Leg = "hind_left" | "hind_right" | "front_left" | "front_right";

export const GALLOP = {
  /** 一圈幾秒（cat.js 衝刺 1.9 m/s 時再乘 1.2 倍播放，約每秒 2.7 步） */
  cycleS: 0.45,
  /** 擺動角放大幾倍（步伐比走路大） */
  stride: 1.35,
  /** 每條腿在一圈裡的相位（0～1） */
  phase: { hind_left: 0, hind_right: 0.1, front_left: 0.5, front_right: 0.6 } as Record<Leg, number>,
  /** 母體走路的相位（量自 base_clips*.glb 的 walk：右後落後左後 15/30 格、左前 7/30、右前 22/30） */
  walkPhase: { hind_left: 0, hind_right: 0.5, front_left: 7 / 30, front_right: 22 / 30 } as Record<Leg, number>,
  /** 重新取樣的格數 */
  samples: 30,
} as const;

/** 軌道名稱（骨頭.屬性）→ 哪條腿；不是腿回 null */
export function legOf(trackName: string): Leg | null {
  const m = /leg_(hind|front)_(left|right)_/.exec(trackName);
  return m ? (`${m[1]}_${m[2]}` as Leg) : null;
}

const wrap = (u: number) => ((u % 1) + 1) % 1;

/** 四元數軌道的插值器（球面插值；KeyframeTrack.createInterpolant 沒有型別定義，自己建） */
export const quatInterpolant = (track: THREE.KeyframeTrack) =>
  new THREE.QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4));

/** 四元數軌道的平均姿勢（夠用的近似：同號相加再正規化） */
function meanQuat(values: ArrayLike<number>): THREE.Quaternion {
  const m = new THREE.Quaternion(0, 0, 0, 0), q = new THREE.Quaternion();
  for (let i = 0; i < values.length; i += 4) {
    q.fromArray(values as number[], i);
    if (m.x * q.x + m.y * q.y + m.z * q.z + m.w * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    m.set(m.x + q.x, m.y + q.y, m.z + q.z, m.w + q.w);
  }
  return m.normalize();
}

/** 相對平均姿勢的轉角放大 k 倍 */
function amplify(q: THREE.Quaternion, mean: THREE.Quaternion, k: number): THREE.Quaternion {
  const d = q.clone().multiply(mean.clone().invert());
  if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
  const angle = 2 * Math.acos(Math.min(1, d.w));
  const s = Math.sqrt(Math.max(0, 1 - d.w * d.w));
  if (s < 1e-6) return q.clone();
  const axis = new THREE.Vector3(d.x / s, d.y / s, d.z / s);
  return new THREE.Quaternion().setFromAxisAngle(axis, angle * k).multiply(mean);
}

/** 用走路重組出奔跑（名稱 run）；走路裡沒有腿的四元數軌道就回 null */
export function gallopClip(walk: THREE.AnimationClip, opt: typeof GALLOP = GALLOP): THREE.AnimationClip | null {
  if (!walk.tracks.some(t => legOf(t.name) && t.name.endsWith(".quaternion"))) return null;
  const n = opt.samples, T = walk.duration || 1, scale = opt.cycleS / T;
  const times = Array.from({ length: n + 1 }, (_, i) => (i / n) * opt.cycleS);
  const tracks = walk.tracks.map(track => {
    const leg = legOf(track.name);
    if (!leg || !track.name.endsWith(".quaternion")) {
      const t = track.clone();
      t.scale(scale);
      return t;
    }
    const interp = quatInterpolant(track);
    const mean = meanQuat(track.values);
    const shift = opt.walkPhase[leg] - opt.phase[leg];
    const values: number[] = [];
    const q = new THREE.Quaternion();
    for (let i = 0; i <= n; i++) {
      const src = wrap(i / n + shift) * T;
      q.fromArray(Array.from(interp.evaluate(src) as ArrayLike<number>)).normalize();
      values.push(...amplify(q, mean, opt.stride).toArray());
    }
    return new THREE.QuaternionKeyframeTrack(track.name, times, values);
  });
  return new THREE.AnimationClip("run", opt.cycleS, tracks);
}
