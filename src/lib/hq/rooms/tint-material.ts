// 虛擬物件（用品、玩具、貓）跟著白天／夜晚調色（#354）：把物件底下每個材質換成「複製一份＋輸出乘上 vec3 uniform」。
// 複製是為了不動到模型快取裡共用的材質（MeowHQ 不傳 light 的檢視器會用到同一份 GLB）。
// 每個材質只換一次（userData.meowTint 記號），之後換日夜只改 uniform 的值，不重新編譯。
import * as THREE from "three";
import { tintFragment } from "./splat-tint";

const TAG = "meowTint";

/**
 * 換成會乘上 uniform 的複本；已經換過（或是 ShaderMaterial，例如函式庫的輔助物件）原樣回傳。
 * inPlace：材質本來就是這個物件自己的複本、別的程式還拿著它在改（例如 CatPreview 的毛色材質）時，直接改它、不複製
 */
export function tintedMaterial(m: THREE.Material, uniform: string, value: THREE.Vector3, inPlace = false): THREE.Material {
  if (m.userData[TAG] || (m as THREE.ShaderMaterial).isShaderMaterial) return m;
  const key = m.customProgramCacheKey.bind(m);
  const c = inPlace ? m : m.clone();
  c.userData[TAG] = uniform;
  const prev = m.onBeforeCompile;  // 材質原本的 onBeforeCompile（例如貓眼）要先跑；clone 不會複製它
  c.onBeforeCompile = (shader, renderer) => {
    prev.call(c, shader, renderer);
    shader.uniforms[uniform] = { value };
    shader.fragmentShader = tintFragment(shader.fragmentShader, uniform, false);
  };
  c.customProgramCacheKey = () => `${key()}|${uniform}`;
  if (inPlace) c.needsUpdate = true;
  return c;
}

/** 物件底下所有 mesh 的材質都換成乘上 uniform 的複本；only 有給就只處理符合的材質（inPlace 時一定要給）。回傳這次換了幾個 */
export function tintObject(root: THREE.Object3D, uniform: string, value: THREE.Vector3, opts: { inPlace?: boolean; only?: (m: THREE.Material) => boolean } = {}): number {
  let n = 0;
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.material) return;
    const swap = (m: THREE.Material) => {
      if (m.userData[TAG] || (opts.only && !opts.only(m))) return m;
      const t = tintedMaterial(m, uniform, value, opts.inPlace);
      if (t.userData[TAG]) n++;
      return t;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return n;
}
