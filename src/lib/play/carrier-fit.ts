// 虛擬飼養第 1 天：貓整隻縮在外出籠裡（掃描房間、示範娃娃屋共用）。純函式，單位公尺。
// 外出籠自己的座標：原點在籠底中心、x 寬、y 高、z 長，門在 +z 那頭；rotY（弧度）＝籠子水平轉了多少（three.js rotation.y）。
// 貓的包圍盒用貓模型自己的座標：原點在腳底、面向 +z（RoomCat、CatModel 都是），由畫面載入模型後播放躲藏動作量出來。

export type Vec3 = [number, number, number];
export interface Bounds3 { min: Vec3; max: Vec3 }
export interface CarrierBox { x: number; z: number; widthM: number; depthM: number; heightM: number; rotY?: number }
export interface CarrierFit {
  /** 貓要縮放的倍數（不會放大） */
  scale: number;
  /** 貓模型原點的位置（地板座標 x、z，離地高度 y） */
  x: number; y: number; z: number;
  /** 貓面向的角度（同 rotation.y）：朝門口 */
  heading: number;
  /** 縮放後的貓包圍盒是否完全在籠內 */
  fits: boolean;
}

/**
 * 籠內可用空間，用外出籠外殼尺寸的比例表示。
 * 來源：public/play/cat_carrier.glb 依 items.ts 的 0.33 × 0.31 × 0.51 公尺縮放後量頂點（2026-11-14）：
 * 外殼寬 ±0.149～0.165、殼頂 0.275（提把到 0.31）、長 ±0.255，門的鐵網在 z ＝ +0.213。
 * 牆厚不知道，取保守值：寬 ±0.12、底 0.015～頂 0.235、後 −0.225～門內 +0.195。
 */
const INNER = {
  halfW: 0.12 / 0.33,
  floor: 0.015 / 0.31, top: 0.235 / 0.31,
  back: -0.225 / 0.51, front: 0.195 / 0.51,
};
/** 貓和籠壁至少留多少空隙（公尺） */
export const CARRIER_MARGIN_M = 0.012;

/** 籠內可用空間（外出籠自己的座標） */
export function carrierInner(c: Pick<CarrierBox, "widthM" | "depthM" | "heightM">): Bounds3 {
  return {
    min: [-INNER.halfW * c.widthM, INNER.floor * c.heightM, INNER.back * c.depthM],
    max: [INNER.halfW * c.widthM, INNER.top * c.heightM, INNER.front * c.depthM],
  };
}

/** a 是否完全在 b 裡面 */
export const insideBox = (a: Bounds3, b: Bounds3, eps = 1e-9) =>
  [0, 1, 2].every(k => a.min[k] >= b.min[k] - eps && a.max[k] <= b.max[k] + eps);

/** 貓（包圍盒 cat）放進外出籠 c：縮到放得下（留 margin）、貼著最裡面、面向門口 */
export function fitCatInCarrier(c: CarrierBox, cat: Bounds3, margin = CARRIER_MARGIN_M): CarrierFit {
  const inner = carrierInner(c);
  const size = [0, 1, 2].map(k => cat.max[k] - cat.min[k]);
  const room = [0, 1, 2].map(k => inner.max[k] - inner.min[k] - 2 * margin);
  const ok = size.every(v => v > 0) && room.every(v => v > 0);
  const scale = ok ? Math.min(1, ...size.map((v, k) => room[k] / v)) : 1;
  // 籠子座標裡貓原點的位置：左右置中、坐在籠底、屁股貼著最裡面
  const ox = (inner.min[0] + inner.max[0]) / 2 - ((cat.min[0] + cat.max[0]) / 2) * scale;
  const oy = inner.min[1] + margin - cat.min[1] * scale;
  const oz = inner.min[2] + margin - cat.min[2] * scale;
  const t = c.rotY ?? 0, cos = Math.cos(t), sin = Math.sin(t);
  const box: Bounds3 = {
    min: [ox + cat.min[0] * scale, oy + cat.min[1] * scale, oz + cat.min[2] * scale],
    max: [ox + cat.max[0] * scale, oy + cat.max[1] * scale, oz + cat.max[2] * scale],
  };
  return {
    scale,
    x: c.x + ox * cos + oz * sin,
    y: oy,
    z: c.z - ox * sin + oz * cos,
    heading: t,
    fits: ok && insideBox(box, inner),
  };
}

/** 貓走出籠門後，屁股離籠門至少多遠（公尺）：沒量到包圍盒時當作貓身後半段的長度 */
export const EXIT_REAR_M = 0.25;
/** 走出籠門後和籠門留的空隙（公尺） */
export const EXIT_GAP_M = 0.06;

/**
 * 從外出籠出來（原尺寸）：貓站在籠門外、面向外面，整隻貓（含屁股、尾巴）都在籠外。
 * cat＝原尺寸的貓包圍盒（模型座標、面向 +z）；沒有就用 EXIT_REAR_M。
 */
export function carrierExit(c: CarrierBox, cat?: Bounds3 | null): { x: number; z: number; heading: number } {
  const t = c.rotY ?? 0;
  const rear = Math.max(cat ? -cat.min[2] : 0, EXIT_REAR_M);
  const out = c.depthM / 2 + rear + EXIT_GAP_M;
  return { x: c.x + Math.sin(t) * out, z: c.z + Math.cos(t) * out, heading: t };
}
