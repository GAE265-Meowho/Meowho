import { Mesh, MeshBasicMaterial, SphereGeometry, type Object3D, type Raycaster } from "three";
import type { PetZone } from "./pet-rules";

// 母體 GLB 靜止姿勢的公尺座標。尾巴依各節主要蒙皮頂點的範圍配置。
const regions = [
  ["head", "head0", [0.018, 0.408, 0.173], [0.081, 0.067, 0.072]],
  ["chin", "jaw", [0.02, 0.339, 0.205], [0.049, 0.025, 0.037]],
  ["back", "body_bot", [0.009, 0.302, -0.062], [0.087, 0.061, 0.15]],
  ["belly", "body_bot", [0.009, 0.212, -0.058], [0.075, 0.047, 0.132]],
  ["tail", "tail1", [0, 0.24, -0.241], [0.026, 0.036, 0.029]],
  ["tail", "tail2", [0, 0.186, -0.261], [0.025, 0.029, 0.029]],
  ["tail", "tail3", [-0.002, 0.146, -0.278], [0.024, 0.03, 0.034]],
  ["tail", "tail4", [-0.004, 0.123, -0.321], [0.023, 0.026, 0.031]],
  ["tail", "tail5", [-0.004, 0.117, -0.366], [0.021, 0.021, 0.027]],
  ["tail", "tail6", [-0.004, 0.134, -0.404], [0.019, 0.027, 0.026]],
] as const;

export function createPetHitRegions(model: Object3D) {
  const geometry = new SphereGeometry(1, 12, 8);
  const material = new MeshBasicMaterial();
  model.updateWorldMatrix(true, true);
  const proxies = regions.flatMap(([zone, bone, [x, y, z], [sx, sy, sz]]) => {
    const joint = model.getObjectByName(bone);
    if (!joint) return [];
    const proxy = new Mesh(geometry, material);
    proxy.position.set(x, y, z);
    proxy.scale.set(sx, sy, sz);
    proxy.visible = false;
    proxy.userData.zone = zone;
    joint.attach(proxy);
    return [proxy];
  });

  return {
    hit(ray: Raycaster): PetZone {
      // 更新代理的祖先與自身，取當下姿勢；不必遍歷整個渲染場景。
      for (const proxy of proxies) proxy.updateWorldMatrix(true, false);
      const hits = ray.intersectObjects(proxies, false);
      const nearest = hits[0];
      if (!nearest) return null;
      // 兩個代理表面幾乎同深度時，以較窄的尾根為準；前方的軀幹仍會遮住尾巴。
      if (nearest.object.userData.zone === "back" && hits.some(hit =>
        hit.object.userData.zone === "tail" && hit.distance - nearest.distance <= 0.018
      )) return "tail";
      return nearest.object.userData.zone;
    },
    dispose() {
      for (const proxy of proxies.splice(0)) proxy.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
