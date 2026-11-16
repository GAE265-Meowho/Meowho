// 虛擬飼養第 1 天：貓整隻縮在外出籠裡，身體任何部位都不能露出籠外。純函式。
import { describe, expect, it } from "vitest";
import { carrierExit, carrierInner, CARRIER_MARGIN_M, EXIT_GAP_M, EXIT_REAR_M, fitCatInCarrier, insideBox, type Bounds3 } from "./carrier-fit";

const carrier = { x: 2, z: 3, widthM: 0.33, depthM: 0.51, heightM: 0.31 };
// 成貓趴姿（含尾巴）約 0.2 寬 × 0.18 高 × 0.6 長，原點在腳底中心、面向 +z
const lying: Bounds3 = { min: [-0.1, 0, -0.38], max: [0.1, 0.18, 0.22] };

/** 把 fit 結果換回外出籠自己的座標，算貓的包圍盒 */
function catBoxInCarrier(c: typeof carrier & { rotY?: number }, cat: Bounds3, fit: ReturnType<typeof fitCatInCarrier>): Bounds3 {
  const t = c.rotY ?? 0, dx = fit.x - c.x, dz = fit.z - c.z;
  const ox = dx * Math.cos(t) - dz * Math.sin(t), oz = dx * Math.sin(t) + dz * Math.cos(t);
  return {
    min: [ox + cat.min[0] * fit.scale, fit.y + cat.min[1] * fit.scale, oz + cat.min[2] * fit.scale],
    max: [ox + cat.max[0] * fit.scale, fit.y + cat.max[1] * fit.scale, oz + cat.max[2] * fit.scale],
  };
}

describe("carrierInner", () => {
  it("籠內空間比外殼小、門在 +z 那頭", () => {
    const b = carrierInner(carrier);
    expect(b.min[0]).toBeGreaterThan(-carrier.widthM / 2);
    expect(b.max[0]).toBeLessThan(carrier.widthM / 2);
    expect(b.min[1]).toBeGreaterThan(0);
    expect(b.max[1]).toBeLessThan(carrier.heightM);
    expect(b.min[2]).toBeGreaterThan(-carrier.depthM / 2);
    expect(b.max[2]).toBeLessThan(carrier.depthM / 2);
  });
  it("外出籠換尺寸時照比例縮放", () => {
    const b = carrierInner({ ...carrier, widthM: 0.66, depthM: 1.02, heightM: 0.62 });
    expect(b.max[1]).toBeCloseTo(carrierInner(carrier).max[1] * 2);
  });
});

describe("fitCatInCarrier", () => {
  it("太大的貓縮小到放得下，整隻在籠內（留邊）", () => {
    const fit = fitCatInCarrier(carrier, lying);
    expect(fit.fits).toBe(true);
    expect(fit.scale).toBeLessThan(1);
    const inner = carrierInner(carrier);
    const box = catBoxInCarrier(carrier, lying, fit);
    for (let a = 0; a < 3; a++) {
      expect(box.min[a]).toBeGreaterThanOrEqual(inner.min[a] + CARRIER_MARGIN_M - 1e-9);
      expect(box.max[a]).toBeLessThanOrEqual(inner.max[a] - CARRIER_MARGIN_M + 1e-9);
    }
  });
  it("縮在最裡面（貼著籠底那頭）、面向門口", () => {
    const fit = fitCatInCarrier(carrier, lying);
    const box = catBoxInCarrier(carrier, lying, fit);
    expect(box.min[2]).toBeCloseTo(carrierInner(carrier).min[2] + CARRIER_MARGIN_M);
    expect(fit.heading).toBe(0);
  });
  it("小貓放得下就不放大", () => {
    const small: Bounds3 = { min: [-0.04, 0, -0.1], max: [0.04, 0.08, 0.06] };
    expect(fitCatInCarrier(carrier, small).scale).toBe(1);
  });
  it("外出籠轉了方向，貓跟著轉、還是在籠內", () => {
    const c = { ...carrier, rotY: Math.PI / 2 };
    const fit = fitCatInCarrier(c, lying);
    expect(fit.heading).toBeCloseTo(Math.PI / 2);
    expect(fit.fits).toBe(true);
    const inner = carrierInner(c), box = catBoxInCarrier(c, lying, fit);
    expect(insideBox(box, inner)).toBe(true);
    // 籠子轉 90 度：原本沿 +z 的位移變成沿 +x
    const flat = fitCatInCarrier(carrier, lying);
    expect(fit.x - c.x).toBeCloseTo(flat.z - carrier.z);
    expect(fit.z - c.z).toBeCloseTo(-(flat.x - carrier.x));
  });
  it("包圍盒是空的（量不到）→ 放不下", () => {
    expect(fitCatInCarrier(carrier, { min: [0, 0, 0], max: [0, 0, 0] }).fits).toBe(false);
  });
});

describe("insideBox", () => {
  it("超出任何一邊都不算在裡面", () => {
    const inner: Bounds3 = { min: [-1, 0, -1], max: [1, 1, 1] };
    expect(insideBox({ min: [-0.5, 0, -0.5], max: [0.5, 0.5, 0.5] }, inner)).toBe(true);
    expect(insideBox({ min: [-0.5, 0, -0.5], max: [0.5, 1.2, 0.5] }, inner)).toBe(false);
    expect(insideBox({ min: [-1.1, 0, -0.5], max: [0.5, 0.5, 0.5] }, inner)).toBe(false);
  });
});

describe("carrierExit", () => {
  const c = { x: 1, z: 2, widthM: 0.33, depthM: 0.51, heightM: 0.31 };
  it("站在籠門外、面向外面，屁股離籠門至少一段貓身", () => {
    const e = carrierExit(c);
    expect(e.heading).toBe(0);
    expect(e.x).toBeCloseTo(1);
    expect(e.z - EXIT_REAR_M - (c.z + c.depthM / 2)).toBeCloseTo(EXIT_GAP_M);
  });
  it("量到的貓比較長時，退得更遠（尾巴也在籠外）", () => {
    const cat: Bounds3 = { min: [-0.1, 0, -0.4], max: [0.1, 0.25, 0.2] };
    const e = carrierExit(c, cat);
    expect(e.z - 0.4 - (c.z + c.depthM / 2)).toBeCloseTo(EXIT_GAP_M);
  });
  it("外出籠轉了方向，從轉過去的門口出來", () => {
    const e = carrierExit({ ...c, rotY: Math.PI / 2 });
    expect(e.heading).toBeCloseTo(Math.PI / 2);
    expect(e.z).toBeCloseTo(2);
    expect(e.x).toBeGreaterThan(1 + c.depthM / 2 + EXIT_REAR_M);
  });
});
