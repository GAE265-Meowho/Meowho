// 擺用品的俯視鏡頭（#354）：從高處往下看整個房間，只能繞房間中心轉（方位角）和調俯仰角，不能走動、不能縮放。
// 全部是純函式：地板座標（公尺，x、z 水平、y 向上，同 clampInRoom）。RoomViewer 的 overview 屬性使用。
import type { RoomScene, Vec3 } from "./demo";

const DEG = Math.PI / 180;

/**
 * 俯視鏡頭的所有可調常數（實機調整只改這裡）。
 * 俯仰角 tilt＝視線離「垂直往下」幾度：0° 是正上方往下看，90° 是平視。
 */
export const OVERVIEW = {
  /** 鏡頭高度（公尺）。要低於 clampInRoom 的上限 2.2；掃描房間天花板有破洞、鏡頭穿出天花板時調低 */
  heightM: 2.1,
  /** 注視點高度（公尺）。0＝房間中心的地板；想讓畫面中心落在家具高度就調高 */
  targetM: 0,
  /** 俯仰角下限：太接近 0° 轉方位時畫面會打轉 */
  tiltMin: 15 * DEG,
  /** 俯仰角上限：再大就接近平視，會看到對面牆的破洞與天花板 */
  tiltMax: 60 * DEG,
  /** 進入擺用品時的俯仰角。從上方看破洞太多就調大（更斜），想更像平面圖就調小 */
  tiltStart: 35 * DEG,
  /** 鏡頭離牆至少幾公尺（要大於 clampInRoom 的 0.15，否則每幀會被推回去） */
  wallM: 0.3,
  /** 按住左右鍵每秒轉幾弧度（約 70°／秒） */
  turnSpeed: 70 * DEG,
  /** 按住上下鍵每秒改幾弧度（約 30°／秒） */
  tiltSpeed: 30 * DEG,
  /** 手指拖曳 1px 轉幾弧度（約 0.3°／px；390px 寬的手機橫拖一次約 117°） */
  dragRadPerPx: 0.3 * DEG,
  /** 進出俯視時飛過去的時間（毫秒；prefers-reduced-motion 時直接跳） */
  flyMs: 700,
} as const;

export interface OverviewAngles { az: number; tilt: number }
export interface OverviewCamera { pos: Vec3; target: Vec3; dir: Vec3 }
/** 按住的方向鍵：x＝右 1、左 −1；y＝上 1、下 −1；放開是 0 */
export interface OverviewHold { x: number; y: number }

export function clampTilt(tilt: number): number {
  if (!Number.isFinite(tilt)) return OVERVIEW.tiltStart;
  return Math.min(Math.max(tilt, OVERVIEW.tiltMin), OVERVIEW.tiltMax);
}

/** 方位角收在 0～2π，轉很多圈也不會累積成大數字 */
export function wrapAzimuth(az: number): number {
  const full = Math.PI * 2;
  return Number.isFinite(az) ? ((az % full) + full) % full : 0;
}

/**
 * 給房間範圍、方位角、俯仰角 → 鏡頭位置、注視點、視線方向。
 * 鏡頭固定在 heightM 高，從房間中心往方位角 az 的方向（地板 x 軸起算，往 z 軸轉）退 h·tan(tilt) 公尺；
 * 退到離牆 wallM 就停住（方位不變，視線自然變陡），所以鏡頭永遠在房間裡。
 */
export function overviewCamera(room: RoomScene["room"], az: number, tilt: number): OverviewCamera {
  const c = Math.cos(room.yaw ?? 0), s = Math.sin(room.yaw ?? 0);
  const cu = (room.min[0] + room.max[0]) / 2, cv = (room.min[1] + room.max[1]) / 2;
  // 方位方向換到沿牆座標（u、v），算從中心沿這個方向到牆內留白的距離
  const ax = Math.cos(az), az2 = Math.sin(az);
  const du = ax * c + az2 * s, dv = -ax * s + az2 * c;
  const halfU = Math.max(0, (room.max[0] - room.min[0]) / 2 - OVERVIEW.wallM);
  const halfV = Math.max(0, (room.max[1] - room.min[1]) / 2 - OVERVIEW.wallM);
  const reach = Math.min(Math.abs(du) > 1e-9 ? halfU / Math.abs(du) : Infinity, Math.abs(dv) > 1e-9 ? halfV / Math.abs(dv) : Infinity);
  const h = OVERVIEW.heightM - OVERVIEW.targetM;
  const back = Math.min(h * Math.tan(clampTilt(tilt)), reach);
  const u = cu + du * back, v = cv + dv * back;
  const target: Vec3 = [cu * c - cv * s, OVERVIEW.targetM, cu * s + cv * c];
  const pos: Vec3 = [u * c - v * s, OVERVIEW.heightM, u * s + v * c];
  // 房間太小、退不出去時鏡頭在正上方：視線仍帶一點方位方向，轉頭才不會打轉
  const flat = Math.max(back, h * 0.02);
  const len = Math.hypot(flat, h);
  return { pos, target, dir: [(-ax * flat) / len, -h / len, (-az2 * flat) / len] };
}

/**
 * 按住方向鍵 dt 秒後的角度。右＝鏡頭往自己的右邊繞、上＝更俯視。
 * handed：地板座標的左右手（e1 × up 朝 +e2 為 1，否則 −1；同 roomViews），左右才不會顛倒。
 */
export function stepOverview(v: OverviewAngles, hold: OverviewHold, dt: number, handed = 1): OverviewAngles {
  if (!hold.x && !hold.y) return v;
  return {
    az: wrapAzimuth(v.az - handed * Math.sign(hold.x) * OVERVIEW.turnSpeed * dt),
    tilt: clampTilt(v.tilt - Math.sign(hold.y) * OVERVIEW.tiltSpeed * dt),
  };
}

/** 手指拖曳 dx、dy（px，往右、往下為正）：像抓著房間轉，往右拖＝房間往右轉，往下拖＝更俯視 */
export function dragOverview(v: OverviewAngles, dx: number, dy: number, handed = 1): OverviewAngles {
  if (!dx && !dy) return v;
  return {
    az: wrapAzimuth(v.az + handed * dx * OVERVIEW.dragRadPerPx),
    tilt: clampTilt(v.tilt - dy * OVERVIEW.dragRadPerPx),
  };
}

/** 開場角度：站在「前」視角（門口）那一側往房間裡看。frontDir＝roomViews().front.dir */
export function overviewStart(frontDir: Vec3): OverviewAngles {
  const flat = Math.hypot(frontDir[0], frontDir[2]);
  return { az: flat > 1e-9 ? wrapAzimuth(Math.atan2(-frontDir[2], -frontDir[0])) : 0, tilt: OVERVIEW.tiltStart };
}
