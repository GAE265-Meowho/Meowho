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

/**
 * 鍵盤方向鍵（held＝目前按著的 KeyboardEvent.code）和畫面按鈕（pad）合併成一個按住方向。
 * 同方向不加倍、相反方向互相抵消；WASD 不算（俯視時不能走動）。
 */
export function holdFromKeys(held: ReadonlySet<string>, pad: OverviewHold | null): OverviewHold {
  const key = (plus: string, minus: string) => (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);
  return {
    x: Math.sign((pad?.x ?? 0) + key("ArrowRight", "ArrowLeft")) || 0,
    y: Math.sign((pad?.y ?? 0) + key("ArrowUp", "ArrowDown")) || 0,
  };
}

// ---------- 四個固定的俯視視點（2026-11-14 渝茜：方向鍵＝切換「從房間哪一側看」，取代連續轉動） ----------

/** 從房間哪一側往房間裡看：front＝門口（roomViews 的「前」）那一側 */
export type OverviewSide = "front" | "back" | "left" | "right";
export const OVERVIEW_SIDES: readonly OverviewSide[] = ["front", "right", "back", "left"];

/** 四個視點與畫面配合的可調常數（實機調整只改這裡） */
export const SIDE_VIEW = {
  /** 鏡頭高度（公尺）：靠在那一側的牆邊高處；要低於 clampInRoom 的上限 2.2，不然會被推回、甚至看到天花板外 */
  heightM: 2.1,
  /** 鏡頭離那一側的牆幾公尺（要大於 clampInRoom 的 0.15；掃描房間牆外是破洞，不能退到牆外） */
  wallM: 0.3,
  /** 要入鏡的「房間角」高度：地板（0）和家具高度（這裡）兩層，各四個角 */
  fitTopM: 1.0,
  /** 離鏡頭水平距離不到這麼遠的點不算（鏡頭身後、腳下那一面牆的角本來就拍不到） */
  fitNearM: 1.0,
  /** 入鏡時四周再留的比例（1.1＝多 10%） */
  fitPad: 1.1,
  /** 整個畫面（含被卡片蓋住的部分）的垂直 FOV 上下限（度）。太大邊緣會拉扯變形 */
  fovMinDeg: 55,
  fovMaxDeg: 115,
  /** 水平 FOV 上限（度）：電腦寬畫面時由這個限制，避免魚眼感 */
  hfovMaxDeg: 115,
  /** 往下看的角度上下限（度，從水平往下算） */
  pitchMinDeg: 20,
  pitchMaxDeg: 75,
  /** 畫面下方被擺用品卡片蓋住的比例上限（量到更多也只讓出這麼多） */
  coverMax: 0.6,
  /** 拖曳微調：最多偏離視點幾度，放開後保持（換一側時歸零） */
  dragMaxDeg: 25,
} as const;

/** 視點的方位角（同 overviewCamera 的 az：鏡頭在中心的 az 方向）。右側＝站在前側時右手邊那一側 */
export function sideAzimuth(frontDir: Vec3, side: OverviewSide, handed = 1): number {
  const az0 = overviewStart(frontDir).az;
  const turn = { front: 0, right: -handed * 90, back: 180, left: handed * 90 }[side] * DEG;
  return wrapAzimuth(az0 + turn);
}

/** 鍵盤方向鍵 → 哪一側（和畫面按鈕同一套：上＝後側、下＝前側，像看平面圖時門口在下方） */
export function sideFromKey(code: string): OverviewSide | null {
  return ({ ArrowUp: "back", ArrowDown: "front", ArrowLeft: "left", ArrowRight: "right" } as Record<string, OverviewSide>)[code] ?? null;
}

/** 房間的八個角（地板＋家具高度兩層），地板座標 */
export function roomCorners(room: RoomScene["room"]): Vec3[] {
  const c = Math.cos(room.yaw ?? 0), s = Math.sin(room.yaw ?? 0);
  const out: Vec3[] = [];
  for (const y of [0, SIDE_VIEW.fitTopM]) for (const u of [room.min[0], room.max[0]]) for (const v of [room.min[1], room.max[1]]) {
    out.push([u * c - v * s, y, u * s + v * c]);
  }
  return out;
}

/** 入鏡要考慮的點：八個角，加上兩側牆在 fitNearM 處的地板點（看得到鏡頭前方的地板邊） */
function fitPoints(room: RoomScene["room"], pos: Vec3, hx: number, hz: number): Vec3[] {
  const c = Math.cos(room.yaw ?? 0), s = Math.sin(room.yaw ?? 0);
  const pts = roomCorners(room);
  // 水平前方 fitNearM 那條線和四面牆的交點（只取在房間範圍內的）
  const du = hx * c + hz * s, dv = -hx * s + hz * c;
  const pu = pos[0] * c + pos[2] * s, pv = -pos[0] * s + pos[2] * c;
  const lu = pu + du * SIDE_VIEW.fitNearM, lv = pv + dv * SIDE_VIEW.fitNearM;  // 線上一點，線方向 (−dv, du)
  const eps = 1e-6;
  for (const [axis, val] of [[0, room.min[0]], [0, room.max[0]], [1, room.min[1]], [1, room.max[1]]] as const) {
    const dir = axis === 0 ? -dv : du;
    if (Math.abs(dir) < eps) continue;
    const t = (val - (axis === 0 ? lu : lv)) / dir;
    const u = lu - dv * t, v = lv + du * t;
    if (u < room.min[0] - eps || u > room.max[0] + eps || v < room.min[1] - eps || v > room.max[1] + eps) continue;
    pts.push([u * c - v * s, 0, u * s + v * c]);
  }
  return pts.filter(p => (p[0] - pos[0]) * hx + (p[2] - pos[2]) * hz >= SIDE_VIEW.fitNearM - 1e-6);
}

/**
 * 某一側的俯視視點：鏡頭在那一側牆邊（離牆 wallM、高 heightM），水平朝房間中心，
 * 往下看的角度取「要入鏡的點」上下範圍的正中間，房間才會落在畫面中央。
 */
export function sideCamera(room: RoomScene["room"], az: number): OverviewCamera {
  const c = Math.cos(room.yaw ?? 0), s = Math.sin(room.yaw ?? 0);
  const cu = (room.min[0] + room.max[0]) / 2, cv = (room.min[1] + room.max[1]) / 2;
  const ax = Math.cos(az), az2 = Math.sin(az);
  const du = ax * c + az2 * s, dv = -ax * s + az2 * c;
  const halfU = Math.max(0, (room.max[0] - room.min[0]) / 2 - SIDE_VIEW.wallM);
  const halfV = Math.max(0, (room.max[1] - room.min[1]) / 2 - SIDE_VIEW.wallM);
  const reach = Math.min(Math.abs(du) > 1e-9 ? halfU / Math.abs(du) : Infinity, Math.abs(dv) > 1e-9 ? halfV / Math.abs(dv) : Infinity);
  const u = cu + du * reach, v = cv + dv * reach;
  const pos: Vec3 = [u * c - v * s, SIDE_VIEW.heightM, u * s + v * c];
  const target: Vec3 = [cu * c - cv * s, 0, cu * s + cv * c];
  const hx = -ax, hz = -az2;  // 水平朝房間中心
  const elev = fitPoints(room, pos, hx, hz).map(p => Math.atan2(p[1] - pos[1], (p[0] - pos[0]) * hx + (p[2] - pos[2]) * hz));
  const mid = elev.length ? -(Math.min(...elev) + Math.max(...elev)) / 2 : 45 * DEG;
  const pitch = Math.min(Math.max(mid, SIDE_VIEW.pitchMinDeg * DEG), SIDE_VIEW.pitchMaxDeg * DEG);
  return { pos, target, dir: [hx * Math.cos(pitch), -Math.sin(pitch), hz * Math.cos(pitch)] };
}

/** 鏡頭座標：右、上、前（地板座標 y 向上） */
function cameraBasis(dir: Vec3) {
  const f = dir;
  const rl = Math.hypot(f[2], f[0]) || 1;
  const r: Vec3 = [-f[2] / rl, 0, f[0] / rl];
  const up: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, up };
}

/**
 * 讓房間入鏡要的垂直 FOV（度，整個畫面、含被卡片蓋住的部分）。
 * cover＝畫面下方被卡片蓋住的比例：搭配 coverViewOffset，可見區域的上下範圍是 ±tan(fov/2)·(1−cover)。
 */
export function fitFov(room: RoomScene["room"], cam: OverviewCamera, aspect: number, cover = 0): number {
  const k = 1 - Math.min(Math.max(cover, 0), SIDE_VIEW.coverMax);
  const { f, r, up } = cameraBasis(cam.dir);
  const hx = cam.dir[0], hz = cam.dir[2], hl = Math.hypot(hx, hz) || 1;
  let t = Math.tan((SIDE_VIEW.fovMinDeg * DEG) / 2);
  for (const p of fitPoints(room, cam.pos, hx / hl, hz / hl)) {
    const d = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (z < 1e-3) continue;
    const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
    const y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
    t = Math.max(t, (SIDE_VIEW.fitPad * Math.abs(y)) / z / k, (SIDE_VIEW.fitPad * Math.abs(x)) / z / Math.max(aspect, 0.1));
  }
  const max = Math.min(Math.tan((SIDE_VIEW.fovMaxDeg * DEG) / 2), Math.tan((SIDE_VIEW.hfovMaxDeg * DEG) / 2) / Math.max(aspect, 0.1));
  return (2 * Math.atan(Math.min(t, max))) / DEG;
}

/** 畫面中心往上移到卡片上方可見區的中間：camera.setViewOffset(w, h, 0, 這個值, w, h) */
export function coverViewOffset(heightPx: number, cover: number): number {
  return (heightPx * Math.min(Math.max(cover, 0), SIDE_VIEW.coverMax)) / 2;
}

/** 拖曳微調：只左右轉，最多偏離 dragMaxDeg */
export function dragSideOffset(offset: number, dx: number, handed = 1): number {
  const max = SIDE_VIEW.dragMaxDeg * DEG;
  return Math.min(Math.max(offset + handed * dx * OVERVIEW.dragRadPerPx, -max), max);
}
