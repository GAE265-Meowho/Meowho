// 摸貓的視角（渝茜 2026-11-16：旁邊做旋轉畫面的方向鍵，滑鼠只摸貓、不調整畫面方向）。純函式。
// 鏡頭繞著貓（target）轉：左右可以一直轉，上下限制在 OrbitControls 原本的範圍（不轉到正上方、不轉到地板下）。

type V3 = [number, number, number];

export const PET_VIEW = {
  /** 每一步左右轉幾弧度（按住方向鍵會連續轉） */
  yawStep: Math.PI / 30,
  /** 每一步上下轉幾弧度 */
  pitchStep: Math.PI / 60,
  /** 上下範圍（從正上方量的角度）：同原本 OrbitControls 的 minPolarAngle、maxPolarAngle */
  minPolar: 0.48,
  maxPolar: Math.PI / 2 - 0.12,
  /** 按住時每隔幾毫秒轉一步 */
  repeatMs: 45,
} as const;

/** 鏡頭 pos 繞 target 轉：yaw＝往右轉幾步（負的往左），pitch＝往上幾步（負的往下） */
export function petOrbit(pos: V3, target: V3, yaw: number, pitch: number): V3 {
  const dx = pos[0] - target[0], dy = pos[1] - target[1], dz = pos[2] - target[2];
  const r = Math.hypot(dx, dy, dz);
  if (r === 0) return pos;
  const theta = Math.atan2(dx, dz) + yaw * PET_VIEW.yawStep;
  const phi = Math.min(PET_VIEW.maxPolar, Math.max(PET_VIEW.minPolar, Math.acos(dy / r) - pitch * PET_VIEW.pitchStep));
  return [target[0] + r * Math.sin(phi) * Math.sin(theta), target[1] + r * Math.cos(phi), target[2] + r * Math.sin(phi) * Math.cos(theta)];
}

/** 搖桿的死區（推不到這麼遠不轉，免得手一抖畫面就晃） */
export const STICK_DEADZONE = 0.18;

/**
 * 搖桿（#456，渝茜：摸貓右邊的方向鍵換成搖桿）：旋鈕離中心 (dx, dy) 像素、搖桿半徑 radius → 每一步的 yaw、pitch（−1～1，推得越遠轉越快）。
 * 螢幕 y 往下為正，所以往上推是 pitch 為正（往上看）。超過半徑算推到底，死區內回 0。
 */
export function stickTurn(dx: number, dy: number, radius: number): { yaw: number; pitch: number; x: number; y: number } {
  if (radius <= 0) return { yaw: 0, pitch: 0, x: 0, y: 0 };
  const len = Math.hypot(dx, dy);
  const k = len > radius ? radius / len : 1;  // 旋鈕最多拉到邊緣
  const x = (dx * k) / radius, y = (dy * k) / radius;
  if (Math.hypot(x, y) < STICK_DEADZONE) return { yaw: 0, pitch: 0, x, y };
  return { yaw: x, pitch: -y, x, y };
}
