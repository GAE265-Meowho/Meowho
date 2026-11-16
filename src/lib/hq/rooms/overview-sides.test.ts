import { describe, expect, it } from "vitest";
import { OVERVIEW_SIDES, SIDE_VIEW, coverViewOffset, dragSideOffset, fitFov, roomCorners, sideAzimuth, sideCamera, sideFromKey } from "./overview";
import { clampInRoom, type RoomScene } from "./demo";

const rooms: RoomScene["room"][] = [
  { min: [0, 0], max: [4, 3] },
  { min: [-2, -1.5], max: [2, 1.5], yaw: 0.6 },
  { min: [1, -3], max: [6.5, 2], yaw: -1.2 },
];
const DEG = Math.PI / 180;
/** 門口方向（roomViews 的 front.dir 一定沿著牆）：房間 v 軸 */
const frontOf = (room: RoomScene["room"]): [number, number, number] => [-Math.sin(room.yaw ?? 0), 0, Math.cos(room.yaw ?? 0)];
const front = frontOf({ min: [0, 0], max: [1, 1] });

/** 點在鏡頭畫面可見區（含卡片讓出的部分）內嗎 */
function inView(room: RoomScene["room"], az: number, aspect: number, cover: number, p: readonly number[]) {
  const cam = sideCamera(room, az);
  const fov = fitFov(room, cam, aspect, cover);
  const f = cam.dir, rl = Math.hypot(f[0], f[2]);
  const r = [-f[2] / rl, 0, f[0] / rl];
  const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
  const dot = (a: number[]) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  const z = dot([...f]), t = Math.tan((fov * DEG) / 2);
  return z > 0 && Math.abs(dot(up)) / z <= t * (1 - cover) + 1e-9 && Math.abs(dot(r)) / z <= t * aspect + 1e-9;
}

describe("擺用品的四側俯視視點", () => {
  it("四個視點的鏡頭都在房間裡、不出天花板，視線往下看向房間中心", () => {
    for (const room of rooms) for (const side of OVERVIEW_SIDES) {
      const cam = sideCamera(room, sideAzimuth(frontOf(room), side));
      const inside = clampInRoom(cam.pos, room, SIDE_VIEW.wallM - 1e-6);
      cam.pos.forEach((v, i) => expect(v).toBeCloseTo(inside[i], 6));
      expect(cam.pos[1]).toBeLessThanOrEqual(2.2);
      expect(cam.dir[1]).toBeLessThan(0);
      // 水平方向指向中心
      const toC = [cam.target[0] - cam.pos[0], cam.target[2] - cam.pos[2]];
      const cross = toC[0] * cam.dir[2] - toC[1] * cam.dir[0];
      expect(Math.abs(cross) / Math.hypot(...toC) / Math.hypot(cam.dir[0], cam.dir[2])).toBeLessThan(1e-9);
      expect(toC[0] * cam.dir[0] + toC[1] * cam.dir[2]).toBeGreaterThan(0);
    }
  });

  it("四個視點分別在房間的四側，前側在門口那邊、左右不顛倒", () => {
    const azs = OVERVIEW_SIDES.map(s => sideAzimuth(front, s));
    expect(new Set(azs.map(a => Math.round(a / DEG))).size).toBe(4);
    // front 方向朝 +z → 鏡頭在 −z 那側；right（handed=1）在 x 的哪一側由 handed 決定，handed 反過來就對調
    expect(Math.sin(sideAzimuth(front, "front"))).toBeCloseTo(-1);
    expect(Math.sin(sideAzimuth(front, "back"))).toBeCloseTo(1);
    expect(Math.cos(sideAzimuth(front, "right", 1))).toBeCloseTo(-Math.cos(sideAzimuth(front, "right", -1)));
    expect(sideAzimuth(front, "left", 1)).toBeCloseTo(sideAzimuth(front, "right", -1));
  });

  it("鏡頭前方的房間角（地板與家具高度）都在可見區內：電腦寬畫面、手機直式加卡片", () => {
    for (const room of rooms) for (const side of OVERVIEW_SIDES) {
      const az = sideAzimuth(frontOf(room), side);
      const cam = sideCamera(room, az);
      const hx = cam.dir[0], hz = cam.dir[2], hl = Math.hypot(hx, hz);
      const ahead = roomCorners(room).filter(p => ((p[0] - cam.pos[0]) * hx + (p[2] - cam.pos[2]) * hz) / hl >= SIDE_VIEW.fitNearM);
      expect(ahead.length).toBeGreaterThanOrEqual(4);
      for (const p of ahead) expect(inView(room, az, 1280 / 800, 0.3, p)).toBe(true);
    }
    // 手機直式：FOV 到上限時盡量入鏡，至少遠處的四個角都在
    const room = rooms[0];
    const az = sideAzimuth(front, "front");
    const cam = sideCamera(room, az);
    const far = roomCorners(room).filter(p => Math.abs(p[2] - cam.pos[2]) > 2);
    for (const p of far.filter(p => p[1] === 0)) expect(inView(room, az, 375 / 812, 0.45, p)).toBe(true);
  });

  it("FOV 在上下限內，蓋住越多要越大", () => {
    const room = rooms[0], cam = sideCamera(room, 0);
    const a = fitFov(room, cam, 1.6, 0), b = fitFov(room, cam, 1.6, 0.4);
    expect(a).toBeGreaterThanOrEqual(SIDE_VIEW.fovMinDeg - 1e-9);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(fitFov(room, cam, 1.6, 0.55)).toBeGreaterThan(a);
    expect(fitFov(room, cam, 0.3, 0.9)).toBeLessThanOrEqual(SIDE_VIEW.fovMaxDeg + 1e-9);
    expect(2 * Math.atan(Math.tan((fitFov(room, cam, 3, 0) * DEG) / 2) * 3) / DEG).toBeLessThanOrEqual(SIDE_VIEW.hfovMaxDeg + 1e-6);
  });

  it("view offset 把畫面中心移到卡片上方的中間，蓋太多只讓到上限", () => {
    expect(coverViewOffset(800, 0)).toBe(0);
    expect(coverViewOffset(800, 0.4)).toBeCloseTo(160);
    expect(coverViewOffset(800, 0.95)).toBeCloseTo(800 * SIDE_VIEW.coverMax / 2);
  });

  it("鍵盤方向鍵對應四側，拖曳微調有上限", () => {
    expect(sideFromKey("ArrowUp")).toBe("back");
    expect(sideFromKey("ArrowDown")).toBe("front");
    expect(sideFromKey("ArrowLeft")).toBe("left");
    expect(sideFromKey("ArrowRight")).toBe("right");
    expect(sideFromKey("KeyW")).toBeNull();
    expect(dragSideOffset(0, 1e6)).toBeCloseTo(SIDE_VIEW.dragMaxDeg * DEG);
    expect(dragSideOffset(0, -1e6)).toBeCloseTo(-SIDE_VIEW.dragMaxDeg * DEG);
  });
});
