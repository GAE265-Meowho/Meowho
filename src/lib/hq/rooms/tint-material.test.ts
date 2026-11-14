import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { tintObject } from "./tint-material";

describe("虛擬物件材質乘上 tint", () => {
  it("換成複本（不動到快取裡的原材質），只換一次，著色器最後乘上 uniform", () => {
    const shared = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), [shared, new THREE.ShaderMaterial()]);
    root.add(a, b);
    const v = new THREE.Vector3(0.3, 0.4, 0.5);
    expect(tintObject(root, "uTint", v)).toBe(2);
    expect(a.material).not.toBe(shared);
    expect(shared.userData.meowTint).toBeUndefined();
    expect((b.material as THREE.Material[])[1]).toBeInstanceOf(THREE.ShaderMaterial);
    expect(tintObject(root, "uTint", v)).toBe(0);

    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: "void main() {\n  #include <dithering_fragment>\n}", vertexShader: "" };
    (a.material as THREE.Material).onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uTint.value).toBe(v);
    expect(shader.fragmentShader).toContain("gl_FragColor.rgb *= uTint;");
    expect((a.material as THREE.Material).customProgramCacheKey()).toContain("uTint");
  });

  it("inPlace＋only：只改指定的材質本身（例如貓的毛色複本），不換掉別人拿著的參照", () => {
    const fur = new THREE.MeshStandardMaterial({ name: "cat_fur" });
    const eye = new THREE.MeshStandardMaterial({ name: "cat_eye" });
    const root = new THREE.Group();
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(), fur);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(), eye);
    root.add(m1, m2);
    expect(tintObject(root, "uCatTint", new THREE.Vector3(2, 2, 2), { inPlace: true, only: m => m.name === "cat_fur" })).toBe(1);
    expect(m1.material).toBe(fur);
    expect(fur.userData.meowTint).toBe("uCatTint");
    expect(eye.userData.meowTint).toBeUndefined();
  });
});
