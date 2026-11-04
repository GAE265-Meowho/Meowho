// 瀏覽器端讀取 .glb 外框（公尺假設），供上傳前尺寸檢查。
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { normalizeItemMeters } from "./types";

export async function measureGlbFile(file: File): Promise<{
  widthM: number; depthM: number; heightM: number; scale: number; warning: string | null;
}> {
  const url = URL.createObjectURL(file);
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    return normalizeItemMeters({ x: size.x, y: size.y, z: size.z });
  } finally {
    URL.revokeObjectURL(url);
  }
}
