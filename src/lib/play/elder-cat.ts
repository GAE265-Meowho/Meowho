// 虛擬飼養：老貓的樣子（#354 結局）。老貓模型（第 4 份）還沒有，先用成貓模型：毛色調淡偏灰、體型縮一點、躺著睡。
// 集中在這裡：老貓模型進來後把 ELDER_CAT.look 填上（母體＋貼圖網址），tint 改成 null 就好，畫面不用改。
import * as THREE from "three";
import type { NodeId } from "./story";

export interface ElderCat {
  /** 老貓專用模型；null＝還沒有，沿用這隻貓的成貓模型 */
  look: { baseUrl: string; albedoUrl: string } | null;
  /** 體型倍率（1＝原本大小） */
  scale: number;
  /** 毛色調整：dim＝原本顏色乘多少（變暗一點），haze＝加上的灰（變淡偏灰）；null＝不調 */
  tint: { dim: number; haze: string } | null;
  /** 躺著睡的動作（現有最接近的是 sleep） */
  clip: string;
}

export const ELDER_CAT: ElderCat = {
  look: null,
  scale: 0.9,
  tint: { dim: 0.72, haze: "#4a4744" },
  clip: "sleep",
};

/** 哪個節點用老貓：只有結尾（15 歲） */
export const elderFor = (nodeId: NodeId | string | null, step: string): ElderCat | null =>
  step === "node" && nodeId === "farewell" ? ELDER_CAT : null;

type Tinted = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; userData: { elderOrig?: { color: number; emissive: number } } };

/** 把老貓的毛色套到模型上（或還原）；每幀呼叫也可以，已套過的不重算 */
export function applyElderTint(root: THREE.Object3D | null | undefined, elder: ElderCat | null): void {
  if (!root) return;
  const tint = elder?.tint ?? null;
  const haze = tint ? new THREE.Color(tint.haze) : null;
  root.traverse(o => {
    const mats = (o as THREE.Mesh).isMesh ? ([] as THREE.Material[]).concat((o as THREE.Mesh).material) : [];
    for (const m of mats as Tinted[]) {
      if (!m.color || !m.emissive) continue;
      const orig = m.userData.elderOrig;
      if (tint && haze) {
        if (orig) continue;
        m.userData.elderOrig = { color: m.color.getHex(), emissive: m.emissive.getHex() };
        m.color.multiplyScalar(tint.dim);
        m.emissive.copy(haze);
      } else if (orig) {
        m.color.setHex(orig.color);
        m.emissive.setHex(orig.emissive);
        delete m.userData.elderOrig;
      }
    }
  });
}
