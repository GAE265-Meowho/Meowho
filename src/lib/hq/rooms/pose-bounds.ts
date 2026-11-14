// 量貓模型播某個動作時的包圍盒（虛擬飼養第 1 天把貓塞進外出籠用）。
// 在複製出來的模型上另開一個 mixer 取樣整段動作（含尾巴、耳朵的擺動），不影響畫面上正在播的那隻。
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Bounds3, Vec3 } from "@/lib/play/carrier-fit";

/** root 播 clip 時所有頂點的包圍盒（root 父物件的座標：root 自己的位置、縮放、旋轉都算進去）；量不到回 null */
export function poseBounds(root: THREE.Object3D, clip: THREE.AnimationClip, samples = 24): Bounds3 | null {
  const copy = clone(root);
  const holder = new THREE.Group();
  holder.add(copy);
  const mixer = new THREE.AnimationMixer(copy);
  mixer.clipAction(clip).play();
  const box = new THREE.Box3(), one = new THREE.Box3();
  for (let i = 0; i <= samples; i++) {
    mixer.setTime((clip.duration * i) / samples);
    holder.updateMatrixWorld(true);
    copy.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update(); });
    box.union(one.setFromObject(copy, true));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(copy);
  return box.isEmpty() ? null : { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 };
}

/** 躲在外出籠裡用的動作：趴著（rest）優先，沒有就坐著、睡覺、待機 */
export const TUCK_CLIPS = ["rest", "sit", "sleep", "idle"] as const;
export const tuckClip = (names: readonly string[]) => TUCK_CLIPS.find(n => names.includes(n)) ?? null;
