import { describe, expect, it } from "vitest";
import { PLACE_EDIT, clampToRoom, floorHit, footprintSize, overlaps, parsePoses, screenStep, tryPlace } from "./scan-place";
import type { RoomScene } from "@/lib/hq/rooms/demo";

const room: RoomScene["room"] = { min: [0, 0], max: [4, 3] };
const turned: RoomScene["room"] = { min: [-2, -1.5], max: [2, 1.5], yaw: 0.6 };

describe("擺用品：自由擺放", () => {
  it("點畫面＝射線打到地板的位置；往上看或在地板下方打不到", () => {
    expect(floorHit([1, 2, 1], [0, -1, 0])).toEqual([1, 1]);
    const [x, z] = floorHit([0, 2, 0], [1, -1, 0.5])!;
    expect(x).toBeCloseTo(2);
    expect(z).toBeCloseTo(1);
    expect(floorHit([0, 2, 0], [1, 0.1, 0])).toBeNull();
    expect(floorHit([0, -1, 0], [0, -1, 0])).toBeNull();
  });

  it("夾在房間內並離牆一點，轉過的房間也對", () => {
    expect(clampToRoom(room, -5, 10, 0.4, 0.6)).toEqual([0.2 + PLACE_EDIT.wallM, 3 - 0.3 - PLACE_EDIT.wallM]);
    expect(clampToRoom(room, 2, 1, 0.4, 0.6)).toEqual([2, 1]);
    for (const [x, z] of [[9, 9], [-9, 3], [0, -9]]) {
      const [cx, cz] = clampToRoom(turned, x, z, 0.3, 0.3);
      const c = Math.cos(0.6), s = Math.sin(0.6);
      const u = cx * c + cz * s, v = -cx * s + cz * c;
      expect(u).toBeGreaterThan(-2 + PLACE_EDIT.wallM);
      expect(u).toBeLessThan(2 - PLACE_EDIT.wallM);
      expect(v).toBeGreaterThan(-1.5 + PLACE_EDIT.wallM);
      expect(v).toBeLessThan(1.5 - PLACE_EDIT.wallM);
    }
    // 房間比用品還窄：放中間
    expect(clampToRoom({ min: [0, 0], max: [0.3, 3] }, 5, 1, 0.6, 0.6)[0]).toBeCloseTo(0.15);
  });

  it("轉 90° 寬深對調", () => {
    expect(footprintSize(0.4, 0.6, 0)).toEqual([0.4, 0.6]);
    expect(footprintSize(0.4, 0.6, 1)).toEqual([0.6, 0.4]);
    expect(footprintSize(0.4, 0.6, 2)).toEqual([0.4, 0.6]);
    expect(footprintSize(0.4, 0.6, 3)).toEqual([0.6, 0.4]);
  });

  it("用平面包圍盒判斷重疊；壓到別的用品不接受並說是哪一件", () => {
    expect(overlaps({ x: 0, z: 0, w: 1, d: 1 }, { x: 0.9, z: 0, w: 1, d: 1 })).toBe(true);
    expect(overlaps({ x: 0, z: 0, w: 1, d: 1 }, { x: 1.1, z: 0, w: 1, d: 1 })).toBe(false);
    const others = [{ id: "bowl", x: 2, z: 1.5, w: 0.4, d: 0.3 }];
    expect(tryPlace(room, { w: 0.5, d: 0.5 }, 2.1, 1.5, others)).toEqual({ blockedBy: "bowl" });
    expect(tryPlace(room, { w: 0.5, d: 0.5 }, 3, 0.8, others)).toEqual({ x: 3, z: 0.8 });
    // 點到牆外：夾回來再判斷
    expect(tryPlace(room, { w: 0.5, d: 0.5 }, 9, 0.8, others)).toEqual({ x: 4 - 0.25 - PLACE_EDIT.wallM, z: 0.8 });
  });

  it("移動鈕依鏡頭方向換算：右＝畫面右邊，從不同側看也對，並對齊牆", () => {
    // 鏡頭往 +z 看（handed=1：右手邊是 −x）
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]));
    close(screenStep("up", [0, -1, 1], 1), [0, PLACE_EDIT.stepM]);
    close(screenStep("right", [0, -1, 1], 1), [-PLACE_EDIT.stepM, 0]);
    close(screenStep("right", [0, -1, 1], -1), [PLACE_EDIT.stepM, 0]);
    // 從對面看，左右上下都反過來
    close(screenStep("right", [0, -1, -1], 1), [PLACE_EDIT.stepM, 0]);
    close(screenStep("down", [0, -1, -1], 1), [0, PLACE_EDIT.stepM]);
    // 鏡頭稍微斜（拖曳微調）仍沿牆走
    close(screenStep("up", [0.3, -1, 1], 1), [0, PLACE_EDIT.stepM]);
    // 轉過的房間：沿房間的牆
    const [dx, dz] = screenStep("up", [-Math.sin(0.6), -1, Math.cos(0.6)], 1, 0.6);
    expect(dx).toBeCloseTo(-Math.sin(0.6) * PLACE_EDIT.stepM);
    expect(dz).toBeCloseTo(Math.cos(0.6) * PLACE_EDIT.stepM);
  });

  it("存檔讀回：舊存檔沒有就是空的，壞資料略過", () => {
    expect(parsePoses(undefined)).toEqual({});
    expect(parsePoses({ bowl: { x: 1, z: 2, rot: 5 }, litter_box: { x: "a", z: 1 }, carrier: { x: 0, z: 0 } }))
      .toEqual({ bowl: { x: 1, z: 2, rot: 1 }, carrier: { x: 0, z: 0 } });
  });
});
