import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyElderTint, ELDER_CAT, elderFor, elderWalk } from "./elder-cat";

describe("老貓（結局）", () => {
  it("只有結尾節點用老貓", () => {
    expect(elderFor("farewell", "node")).toBe(ELDER_CAT);
    expect(elderFor("year10", "node")).toBeNull();
    expect(elderFor("farewell", "report")).toBeNull();
  });
  it("老貓模型還沒有：沿用成貓、縮小一點、躺著睡", () => {
    expect(ELDER_CAT.look).toBeNull();
    expect(ELDER_CAT.scale).toBeLessThan(1);
    expect(ELDER_CAT.clip).toBe("sleep");
  });
  it("老貓走路速度是原本的 0.15 倍（渝茜 2026-11-16）；不是老貓不變", () => {
    expect(ELDER_CAT.walk).toBe(0.15);
    expect(elderWalk(ELDER_CAT)).toBe(0.15);
    expect(elderWalk(null)).toBe(1);
  });
  it("毛色調淡偏灰，換回來時還原；重複套不會越來越暗", () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const root = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), m));
    applyElderTint(root, ELDER_CAT);
    applyElderTint(root, ELDER_CAT);
    expect(m.color.r).toBeCloseTo(ELDER_CAT.tint!.dim, 5);
    expect(m.emissive.getHexString()).toBe(ELDER_CAT.tint!.haze.slice(1));
    applyElderTint(root, null);
    expect(m.color.getHex()).toBe(0xffffff);
    expect(m.emissive.getHex()).toBe(0);
  });
});
