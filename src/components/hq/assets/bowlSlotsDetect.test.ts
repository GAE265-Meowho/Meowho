import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { detectBowlSlots, fillBowl } from "./bowlSlotsDetect";

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

/** 照餐碗組模型的材質名稱做一個假模型：碗（cream）、飼料（brown）、水（water） */
const bowlSet = () => {
  const g = new THREE.Group();
  for (const name of ["cream", "brown", "water"]) {
    const mat = new THREE.MeshStandardMaterial();
    mat.name = name;
    g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(), mat), { name }));
  }
  return g;
};
const shown = (g: THREE.Object3D) => g.children.filter(o => o.visible).map(o => o.name);

describe("fillBowl", () => {
  it("空碗只剩碗；餵完出現飼料、換完水出現水，碗一直都在", () => {
    const g = bowlSet();
    fillBowl(g, { food: false, water: false });
    expect(shown(g)).toEqual(["cream"]);
    fillBowl(g, { food: true, water: false });
    expect(shown(g)).toEqual(["cream", "brown"]);
    fillBowl(g, { food: true, water: true });
    expect(shown(g)).toEqual(["cream", "brown", "water"]);
  });

  it("藏起來的飼料和水不影響模型大小，也還認得出水碗在哪一邊", () => {
    const g = fakeSet(true);
    (g.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.name = "water";
    (g.children[2] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.name = "brown";
    const before = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    fillBowl(g, { food: false, water: false });
    expect(g.children[1].visible).toBe(false);
    expect(new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3())).toEqual(before);
    expect(detectBowlSlots(g, [0.01, 0.01, 0.01])!.water[0]).toBeCloseTo(0.13, 1);
  });
});
