// 虛擬飼養 DEMO（#237）：劇情動作 → 3D 貓的目標；用品可以放的位置
import { describe, expect, it } from "vitest";
import { blocked, obstacles } from "@/lib/hq/floorplans/catwalk";
import { houseScene } from "@/lib/hq/floorplans/scene";
import { homeWord } from "./furniture";
import { DEMO_DOLLHOUSE, inventoryFromPlan } from "./room";
import { boxFor, goalFor, itemSpots } from "./stage";

const scene = houseScene([DEMO_DOLLHOUSE])[0];
const labels = inventoryFromPlan(DEMO_DOLLHOUSE).labels;
const places = { hide: homeWord("躲藏處", labels)!, high: homeWord("高處", labels)!, sofa: "沙發" };
const names = Object.fromEntries((DEMO_DOLLHOUSE.furniture ?? []).map((f, i) => [i, f.label]));

describe("goalFor", () => {
  it("躲床底：走到床旁的空地板", () => {
    const g = goalFor(scene, "hide", places, []);
    expect(g?.box).toBeNull();
    expect(blocked(g!.x, g!.z, scene, obstacles(scene))).toBe(false);
  });
  it("跳上高處、窩沙發：指定家具方塊（範例房間的高處＝床，原版 FURN_WORD）", () => {
    expect(scene.boxes[goalFor(scene, "high", places, [])!.box!].furniture).toBe("bed");
    expect(goalFor(scene, "sofa", places, [])).toBeNull();  // 這間房沒有沙發
  });
  it("吃飯：走到餐碗旁；沒擺餐碗就原地", () => {
    const bowl = { id: "bowl", x: 2.5, z: 1.0, widthM: 0.52, depthM: 0.339 };
    const g = goalFor(scene, "eat", places, [bowl]);
    expect(Math.hypot(g!.x - bowl.x, g!.z - bowl.z)).toBeLessThan(1);
    expect(goalFor(scene, "eat", places, [])).toBeNull();
    expect(goalFor(scene, "drink", places, [bowl])).toEqual(goalFor(scene, "eat", places, [bowl]));
  });
  it("睡覺、待著：原地", () => {
    expect(goalFor(scene, "sleep", places, [])).toBeNull();
    expect(goalFor(scene, undefined, places, [])).toBeNull();
  });
  it("房間沒有對應家具時回 null（只用文字情境）", () => {
    expect(boxFor(scene, "沙發底下")).toBeNull();
  });
});

describe("itemSpots", () => {
  it("每個位置都站得下用品，而且不和已放的用品重疊", () => {
    const size = { widthM: 0.341, depthM: 0.506 };
    const spots = itemSpots(scene, size, [], names);
    expect(spots.length).toBeGreaterThan(2);
    expect(spots.some(s => s.label === "床旁")).toBe(true);
    for (const s of spots) expect(blocked(s.x, s.z, scene, obstacles(scene), 0.25)).toBe(false);
    const placed = [{ id: "bowl", ...spots[0], widthM: 0.52, depthM: 0.339 }];
    const again = itemSpots(scene, size, placed, names);
    for (const s of again) expect(Math.hypot(s.x - spots[0].x, s.z - spots[0].z)).toBeGreaterThan(0.3);
  });
});
