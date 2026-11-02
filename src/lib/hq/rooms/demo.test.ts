import { describe, expect, it } from "vitest";
import { cameraForward, dropTarget, placeObjects, roomSplats, roomUnit, sortCameras, type RoomCamera, type RoomObject, type RoomScene } from "./demo";

const cam = (img_name: string, position: RoomCamera["position"] = [0, 0, 0]): RoomCamera => ({
  img_name, position, rotation: [[1, 0, 0.1], [0, 1, 0.2], [0, 0, 0.3]],
});

const object = (id: string, extra: Partial<RoomObject> = {}): RoomObject => ({
  id, label: id, box: { center: [1, 0.5, 2], size: [1, 1, 1], yaw: 0 },
  affordance: { jump_on: false, hide_under: false, push: false, play: false },
  physics: { body: "fixed", surface: "wood" }, ...extra,
});

const scene: RoomScene = {
  frame: { origin: [0, 0, 0], e1: [1, 0, 0], up: [0, 1, 0], e2: [0, 0, 1], units_per_meter: 1 },
  room: { min: [0, 0], max: [4, 4] },
  assets: { room: "scene.splat", room_cut: "objects/room_cut.splat" },
  objects: [object("bed"), object("cup", { splat: { file: "objects/cup.movable.splat", pivot: [1, 2, 3] } })],
};

describe("展示房間", () => {
  it("拍攝點依影格編號排序", () => {
    expect(sortCameras([cam("frame_10.jpg"), cam("frame_9.jpg")]).map(c => c.img_name)).toEqual(["frame_9.jpg", "frame_10.jpg"]);
  });

  it("相機方向取旋轉矩陣第三欄", () => {
    expect(cameraForward(cam("a"))).toEqual([0.1, 0.2, 0.3]);
  });

  it("距離單位是拍攝點範圍的對角線", () => {
    expect(roomUnit([cam("a", [0, 0, 0]), cam("b", [3, 4, 0])])).toBe(5);
  });

  it("物品底部中心從外框中心往下半個高度", () => {
    expect(placeObjects([object("bed")])[0]).toMatchObject({ name: "bed", size_m: [1, 1, 1], floor_pos_m: [1, 0, 2] });
  });

  it("掉落目標取最近、但不是物品正下方的拍攝點", () => {
    expect(dropTarget([0, 0], [[0.1, 0.1], [2, 0], [1, 0]])).toEqual([1, 0]);
    expect(dropTarget([0, 0], [[0.1, 0.1]])).toBeNull();
  });

  it("載入拿掉物品的房間和拆開的小物", () => {
    expect(roomSplats("https://x/room/", scene)).toEqual([
      { url: "https://x/room/objects/room_cut.splat" },
      { url: "https://x/room/objects/cup.movable.splat", position: [1, 2, 3] },
    ]);
  });

  it("沒有拆物品時載入完整房間，不重複疊小物", () => {
    expect(roomSplats("https://x", { ...scene, assets: { room: "scene.splat" } })).toEqual([{ url: "https://x/scene.splat" }]);
  });
});
