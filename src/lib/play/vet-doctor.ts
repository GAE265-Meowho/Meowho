// 虛擬飼養：診間獸醫的看診動作（#354，渝茜 2026-11-14）。純函式：元件（components/play/VetRoom.tsx）每幀呼叫。
// 手臂兩個關節（肩、肘）：給肩膀和手要到的位置，solveArm 用兩段式 IK 算出手肘（上臂、前臂長度固定，手肘往外下方彎）。
// 一輪 14 秒：摸貓背 → 停一下 → 拿聽診器聽貓側腹（另一手扶著背）→ 停一下 → 輕拍背 → 停一下；
// 手要碰到的點由貓的位置（vet-room.ts 的 CAT_AT、CAT_YAW）與體型算出（catSpots）。獸醫說話、減少動態時手放下不動。
import { CAT_AT, CAT_YAW, DOCTOR_AT } from "./vet-room";

export type V3 = readonly [number, number, number];

/** 手臂尺寸與肩膀、手放下的位置（獸醫座標：腳底原點、正前方 +z） */
export const DOCTOR_ARM = {
  upper: 0.3,
  fore: 0.32,
  shoulderL: [-0.2, 1.18, 0.03] as V3,
  shoulderR: [0.2, 1.18, 0.03] as V3,
  restL: [-0.27, 0.72, 0.08] as V3,
  restR: [0.27, 0.72, 0.08] as V3,
};

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 兩段式 IK：肩膀 s → 目標 t；side＝1 右手（手肘往 +x 外側）、−1 左手。碰不到時手臂伸直朝目標 */
export function solveArm(s: V3, t: V3, side: 1 | -1): { elbow: V3; hand: V3 } {
  const { upper: U, fore: F } = DOCTOR_ARM;
  const dir = norm(sub(t, s));
  const d = Math.min(U + F - 1e-6, Math.max(Math.abs(U - F) + 1e-6, len(sub(t, s))));
  const pole0: V3 = [side, -0.5, -0.2];
  const pole = norm(sub(pole0, [dir[0] * dot(pole0, dir), dir[1] * dot(pole0, dir), dir[2] * dot(pole0, dir)]));
  const a = Math.acos(Math.min(1, Math.max(-1, (U * U + d * d - F * F) / (2 * U * d))));
  const elbow = add(add(s, dir, U * Math.cos(a)), pole, U * Math.sin(a));
  return { elbow, hand: add(s, dir, d) };
}

const [PX, , PZ] = DOCTOR_AT.pos;
const COS = Math.cos(DOCTOR_AT.yaw), SIN = Math.sin(DOCTOR_AT.yaw);
/** 世界座標 → 獸醫座標 */
export const toDoctorLocal = (w: V3): V3 => {
  const dx = w[0] - PX, dz = w[2] - PZ;
  return [dx * COS - dz * SIN, w[1], dx * SIN + dz * COS];
};
/** 獸醫座標 → 世界座標 */
export const toWorld = (l: V3): V3 => [PX + l[0] * COS + l[2] * SIN, l[1], PZ - l[0] * SIN + l[2] * COS];

/** 貓身上手要碰的點（世界座標）：背（摸、扶）、靠獸醫那側的側腹（聽診）、背偏屁股（拍） */
export function catSpots(body: string): { back: V3; flank: V3; pat: V3 } {
  const big = body !== "kitten";
  const h = big ? 0.2 : 0.13, w = big ? 0.07 : 0.05;
  const toDoc = norm([PX - CAT_AT.x, 0, PZ - CAT_AT.z]);
  const fwd: V3 = [Math.sin(CAT_YAW), 0, Math.cos(CAT_YAW)];
  const c: V3 = [CAT_AT.x, CAT_AT.y, CAT_AT.z];
  const back = add(add(c, [0, h, 0]), toDoc, 0.02);
  return { back, flank: add(add(c, [0, h * 0.6, 0]), toDoc, w), pat: add(back, fwd, -0.04) };
}

export type ExamBeat = "rest" | "pet" | "listen" | "pat";
export interface DoctorAct {
  beat: ExamBeat;
  /** 左右手要到的位置（獸醫座標） */
  left: V3;
  right: V3;
  /** 聽頭在右手上（聽診中） */
  steth: boolean;
}

export const EXAM_CYCLE = 14;
type Key = readonly [number, V3 | "rest"];

/** 關鍵影格之間用 smoothstep 補間 */
function track(keys: readonly Key[], t: number, rest: V3): V3 {
  const at = (k: Key) => (k[1] === "rest" ? rest : k[1]);
  if (t <= keys[0][0]) return at(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0] = keys[i - 1], [t1] = keys[i];
      const u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u);
      const a = at(keys[i - 1]), b = at(keys[i]);
      return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
    }
  }
  return at(keys[keys.length - 1]);
}

const BEATS: readonly [number, number, ExamBeat][] = [[1.2, 4.6, "pet"], [6.3, 9.3, "listen"], [10.6, 13.0, "pat"]];

/** t 秒時的看診動作。talking＝獸醫在說話（點頭、手放下）；still＝減少動態（靜止） */
export function doctorAct(t: number, { talking, still, body }: { talking: boolean; still: boolean; body: string }): DoctorAct {
  const { restL, restR } = DOCTOR_ARM;
  if (talking || still) return { beat: "rest", left: restL, right: restR, steth: false };
  const c = ((t % EXAM_CYCLE) + EXAM_CYCLE) % EXAM_CYCLE;
  const s = catSpots(body);
  const L = (w: V3) => toDoctorLocal(w);
  const fwd: V3 = [Math.sin(CAT_YAW), 0, Math.cos(CAT_YAW)];
  const stroke = L(add(s.back, fwd, 0.05)), back = L(s.back), flank = L(s.flank), pat = L(s.pat), patUp = L(add(s.pat, [0, 0.06, 0]));
  const right = track([
    [1, "rest"], [1.8, back], [2.4, stroke], [3.0, back], [3.6, stroke], [4.2, back], [5, "rest"],
    [6, "rest"], [6.8, flank], [8.8, flank], [9.6, "rest"],
    [10.4, "rest"], [11, patUp], [11.3, pat], [11.6, patUp], [11.9, pat], [12.2, patUp], [12.5, pat], [13.2, "rest"],
  ], c, restR);
  const left = track([[6, "rest"], [6.8, back], [8.8, back], [9.6, "rest"]], c, restL);
  const beat = BEATS.find(([a, b]) => c >= a && c < b)?.[2] ?? "rest";
  return { beat, left, right, steth: c >= 6.4 && c < 9.2 };
}
