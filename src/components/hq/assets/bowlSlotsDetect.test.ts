import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { detectBowlSlots } from "./bowlSlotsDetect";

/** 假餐碗組：珊瑚色碗墊＋左飼料（咖啡色）＋右水（淺藍），模型單位＝公分 */
function fakeSet(waterRight: boolean) {
  const g = new THREE.Group();
  const mat = (hex: string) => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex) });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(52, 1, 34), mat("#e8806e"));
  g.add(pad);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6), mat("#8cc8dc"));
  const food = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6), mat("#73502f"));
  water.position.set(waterRight ? 13 : -13, 3, 0);
  food.position.set(waterRight ? -13 : 13, 3, 0);
  g.add(water, food);
  return g;
}

describe("detectBowlSlots（#304）", () => {
  it("讀模型顏色找到水碗，飼料碗在另一邊（換成公尺）", () => {
    const s = detectBowlSlots(fakeSet(true), [0.01, 0.01, 0.01])!;
    expect(s.water[0]).toBeCloseTo(0.13, 1);
    expect(s.food[0]).toBeCloseTo(-0.13, 1);
    const l = detectBowlSlots(fakeSet(false), [0.01, 0.01, 0.01])!;
    expect(l.water[0]).toBeLessThan(0);
  });
  it("沒有水的顏色回傳 null", () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(52, 1, 34), new THREE.MeshStandardMaterial({ color: "#e8806e" })));
    expect(detectBowlSlots(g, [0.01, 0.01, 0.01])).toBeNull();
  });
});
