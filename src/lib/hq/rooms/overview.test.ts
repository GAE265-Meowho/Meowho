import { describe, expect, it } from "vitest";
import { OVERVIEW, clampTilt, dragOverview, holdFromKeys, overviewCamera, overviewStart, stepOverview, wrapAzimuth } from "./overview";
import { clampInRoom, type RoomScene } from "./demo";

const room: RoomScene["room"] = { min: [0, 0], max: [4, 3] };
const turned: RoomScene["room"] = { min: [-2, -1.5], max: [2, 1.5], yaw: 0.6 };
const rad = (deg: number) => (deg * Math.PI) / 180;
/** 視線離垂直幾度 */
const tiltOf = (dir: readonly number[]) => (Math.acos(-dir[1] / Math.hypot(dir[0], dir[1], dir[2])) * 180) / Math.PI;

describe("擺用品的俯視鏡頭", () => {
  it("注視點是房間中心的地板，鏡頭在固定高度", () => {
    const v = overviewCamera(room, 0, rad(20));
    expect(v.target).toEqual([2, OVERVIEW.targetM, 1.5]);
    expect(v.pos[1]).toBeCloseTo(OVERVIEW.heightM);
  });

  it("方位角決定鏡頭在中心的哪一側，俯仰角決定離中心多遠", () => {
    const h = OVERVIEW.heightM - OVERVIEW.targetM;
    const a = overviewCamera(room, 0, rad(20));
    expect(a.pos[0]).toBeCloseTo(2 + h * Math.tan(rad(20)));
    expect(a.pos[2]).toBeCloseTo(1.5);
    const b = overviewCamera(room, Math.PI / 2, rad(20));
    expect(b.pos[0]).toBeCloseTo(2);
    expect(b.pos[2]).toBeCloseTo(1.5 + h * Math.tan(rad(20)));
    expect(tiltOf(a.dir)).toBeCloseTo(20);
  });

  it("視線永遠從鏡頭指向注視點，而且往下看", () => {
    for (const az of [0, 1, 2.5, 4, 6]) for (const t of [15, 30, 45, 60]) {
      const { pos, target, dir } = overviewCamera(turned, az, rad(t));
      const d = target.map((v, i) => v - pos[i]);
      const len = Math.hypot(...d);
      d.forEach((v, i) => expect(dir[i]).toBeCloseTo(v / len));
      expect(dir[1]).toBeLessThan(0);
    }
  });

  it("俯仰角夾在下限與上限之間（不會垂直打轉、不會變平視）", () => {
    expect(clampTilt(0)).toBe(OVERVIEW.tiltMin);
    expect(clampTilt(-3)).toBe(OVERVIEW.tiltMin);
    expect(clampTilt(Math.PI / 2)).toBe(OVERVIEW.tiltMax);
    expect(clampTilt(Number.NaN)).toBe(OVERVIEW.tiltStart);
    expect(overviewCamera(room, 0, 0)).toEqual(overviewCamera(room, 0, OVERVIEW.tiltMin));
    expect(overviewCamera(room, 0, 9)).toEqual(overviewCamera(room, 0, OVERVIEW.tiltMax));
    expect(OVERVIEW.tiltMin).toBeGreaterThan(0);
    expect(OVERVIEW.tiltMax).toBeLessThan(Math.PI / 2);
    expect(OVERVIEW.tiltStart).toBeGreaterThanOrEqual(OVERVIEW.tiltMin);
    expect(OVERVIEW.tiltStart).toBeLessThanOrEqual(OVERVIEW.tiltMax);
  });

  it("鏡頭不離開房間：任何方位、任何俯仰角都在牆內，也不會被每幀的夾限再推動", () => {
    for (const r of [room, turned, { min: [0, 0], max: [1.2, 1] } as RoomScene["room"]]) {
      for (let az = 0; az < Math.PI * 2; az += 0.2) for (const t of [OVERVIEW.tiltMin, OVERVIEW.tiltStart, OVERVIEW.tiltMax]) {
        const { pos } = overviewCamera(r, az, t);
        const kept = clampInRoom(pos, r);
        kept.forEach((v, i) => expect(v).toBeCloseTo(pos[i], 9));
      }
    }
  });

  it("碰到牆時鏡頭停在牆邊，方位不變、視線變得比較陡", () => {
    const { pos, dir } = overviewCamera(room, Math.PI / 2, OVERVIEW.tiltMax);  // 短邊方向：1.5 公尺就到牆
    expect(pos[0]).toBeCloseTo(2);
    expect(pos[2]).toBeCloseTo(3 - OVERVIEW.wallM);
    expect(tiltOf(dir)).toBeLessThan(60);
    expect(tiltOf(dir)).toBeGreaterThan(0);
  });

  it("很小的房間（比牆邊留白還小）鏡頭留在中心上方，視線仍然有方向", () => {
    const { pos, dir } = overviewCamera({ min: [0, 0], max: [0.4, 0.4] }, 1, OVERVIEW.tiltMax);
    expect(pos[0]).toBeCloseTo(0.2);
    expect(pos[2]).toBeCloseTo(0.2);
    expect(Math.hypot(...dir)).toBeCloseTo(1);
    expect(Math.hypot(dir[0], dir[2])).toBeGreaterThan(0);  // 不是正下方（正下方轉頭會打轉）
  });

  it("左右轉一圈回到原位", () => {
    const start = { az: 0.7, tilt: rad(35) };
    let v = start;
    const dt = 1 / 60;
    const frames = Math.round((Math.PI * 2) / (OVERVIEW.turnSpeed * dt));
    for (let i = 0; i < frames; i++) v = stepOverview(v, { x: 1, y: 0 }, dt);
    const a = overviewCamera(turned, start.az, start.tilt), b = overviewCamera(turned, v.az, v.tilt);
    b.pos.forEach((p, i) => expect(p).toBeCloseTo(a.pos[i], 1));
    expect(wrapAzimuth(start.az + Math.PI * 2)).toBeCloseTo(start.az);
    expect(overviewCamera(turned, start.az + Math.PI * 2, start.tilt).pos[0]).toBeCloseTo(a.pos[0]);
    expect(wrapAzimuth(-0.1)).toBeCloseTo(Math.PI * 2 - 0.1);
  });

  it("按鈕：左右改方位角（依左右手座標決定正負）、上下改俯仰角，放開（0）不動", () => {
    const v = { az: 1, tilt: rad(35) };
    expect(stepOverview(v, { x: 0, y: 0 }, 0.5)).toEqual(v);
    const right = stepOverview(v, { x: 1, y: 0 }, 0.5), left = stepOverview(v, { x: -1, y: 0 }, 0.5);
    expect(right.az - v.az).toBeCloseTo(-(left.az - v.az));
    expect(Math.abs(right.az - v.az)).toBeCloseTo(OVERVIEW.turnSpeed * 0.5);
    expect(stepOverview(v, { x: 1, y: 0 }, 0.5, -1).az).toBeCloseTo(left.az);
    // 上＝更俯視（離垂直更近），下＝更斜
    expect(stepOverview(v, { x: 0, y: 1 }, 0.1).tilt).toBeLessThan(v.tilt);
    expect(stepOverview(v, { x: 0, y: -1 }, 0.1).tilt).toBeGreaterThan(v.tilt);
    expect(stepOverview(v, { x: 0, y: 1 }, 99).tilt).toBe(OVERVIEW.tiltMin);
    expect(stepOverview(v, { x: 0, y: -1 }, 99).tilt).toBe(OVERVIEW.tiltMax);
  });

  it("拖曳：方向和按鈕相反（像抓著房間轉），俯仰角一樣有夾限", () => {
    const v = { az: 1, tilt: rad(35) };
    expect(dragOverview(v, 0, 0)).toEqual(v);
    const d = dragOverview(v, 100, 0), b = stepOverview(v, { x: 1, y: 0 }, 0.1);
    expect(Math.sign(d.az - v.az)).toBe(-Math.sign(b.az - v.az));
    expect(Math.abs(d.az - v.az)).toBeCloseTo(100 * OVERVIEW.dragRadPerPx);
    expect(dragOverview(v, 0, 50).tilt).toBeLessThan(v.tilt);  // 往下拖＝房間往下轉＝更俯視
    expect(dragOverview(v, 0, -99999).tilt).toBe(OVERVIEW.tiltMax);
    expect(dragOverview(v, 0, 99999).tilt).toBe(OVERVIEW.tiltMin);
  });

  it("開場站在門口那一側往房間裡看", () => {
    const s = overviewStart([1, -0.25, 0]);  // 「前」視角的視線朝 +x
    expect(s.tilt).toBe(OVERVIEW.tiltStart);
    const { pos, target } = overviewCamera(room, s.az, s.tilt);
    expect(pos[0]).toBeLessThan(target[0]);
    expect(pos[2]).toBeCloseTo(target[2]);
    expect(overviewStart([0, -1, 0]).az).toBe(0);  // 沒有水平方向時用 0
  });

  it("鍵盤方向鍵：和畫面上的按鈕合併，同時按左右互相抵消", () => {
    expect(holdFromKeys(new Set(), { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(holdFromKeys(new Set(["ArrowRight"]), { x: 0, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(holdFromKeys(new Set(["ArrowLeft", "ArrowUp"]), null)).toEqual({ x: -1, y: 1 });
    expect(holdFromKeys(new Set(["ArrowLeft", "ArrowRight", "ArrowDown"]), null)).toEqual({ x: 0, y: -1 });
    expect(holdFromKeys(new Set(["ArrowRight"]), { x: 1, y: 0 })).toEqual({ x: 1, y: 0 });  // 按鈕和鍵盤同一方向不會加倍
    expect(holdFromKeys(new Set(["KeyW"]), { x: 0, y: -1 })).toEqual({ x: 0, y: -1 });  // WASD 不算
  });
});
