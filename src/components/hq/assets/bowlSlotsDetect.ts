// 餐碗組的飼料碗、水碗位置（#304）：模型載入後從上往下打一排射線，讀命中點的顏色（貼圖或頂點色），
// 交給 bowl-slots.ts 判斷哪裡是水。結果依放置的用品 key 存起來，貓咪故事線（CatActor）查詢。
import * as THREE from "three";
import { bowlSlotsFromSamples, type ColorSample } from "@/lib/hq/floorplans/bowl-slots";
import type { BowlSlots } from "@/lib/hq/floorplans/story";

const SLOTS = new Map<string, BowlSlots>();
export const bowlSlotsOf = (key: string): BowlSlots | null => SLOTS.get(key) ?? null;
export const setBowlSlots = (key: string, slots: BowlSlots | null) => { if (slots) SLOTS.set(key, slots); else SLOTS.delete(key); };

const pixels = new WeakMap<THREE.Texture, { data: Uint8ClampedArray; w: number; h: number } | null>();

function texturePixels(tex: THREE.Texture) {
  if (pixels.has(tex)) return pixels.get(tex)!;
  let out: { data: Uint8ClampedArray; w: number; h: number } | null = null;
  try {
    const img = tex.image as CanvasImageSource & { width: number; height: number };
    const w = Math.min(img.width, 512), h = Math.min(img.height, 512);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) { ctx.drawImage(img, 0, 0, w, h); out = { data: ctx.getImageData(0, 0, w, h).data, w, h }; }
  } catch { out = null; }
  pixels.set(tex, out);
  return out;
}

function colorAt(hit: THREE.Intersection): [number, number, number] | null {
  const mesh = hit.object as THREE.Mesh;
  const mat = (Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material) as THREE.MeshStandardMaterial;
  const base = mat?.color ?? new THREE.Color(1, 1, 1);
  let [r, g, b] = [1, 1, 1];
  const map = mat?.map;
  if (map && hit.uv) {
    const px = texturePixels(map);
    if (px) {
      // glTF 貼圖 flipY＝false：uv 的 v 直接對應影像由上往下
      const u = ((hit.uv.x % 1) + 1) % 1, v = ((hit.uv.y % 1) + 1) % 1;
      const i = (Math.min(px.h - 1, Math.floor(v * px.h)) * px.w + Math.min(px.w - 1, Math.floor(u * px.w))) * 4;
      [r, g, b] = [px.data[i] / 255, px.data[i + 1] / 255, px.data[i + 2] / 255];
    }
  } else {
    const col = mesh.geometry.getAttribute("color");
    if (col && hit.face) [r, g, b] = [col.getX(hit.face.a), col.getY(hit.face.a), col.getZ(hit.face.a)];
  }
  // 材質底色是線性色，轉回 sRGB 再乘
  const c = base.clone().convertLinearToSRGB();
  return [r * c.r, g * c.g, b * c.b];
}

/** model：還沒縮放、在原點的模型；scale：放進房間時的 X、Y、Z 縮放（模型單位 → 公尺） */
export function detectBowlSlots(source: THREE.Object3D, scale: [number, number, number]): BowlSlots | null {
  // 放進房間後模型會掛在用品的 group 底下（有位置、旋轉）；複製一份不掛父層的，才是用品自己的座標
  const model = source.clone(true);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const samples: ColorSample[] = [];
  const NX = 25, NZ = 15;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const x = box.min.x + ((i + 0.5) / NX) * (box.max.x - box.min.x);
    const z = box.min.z + ((j + 0.5) / NZ) * (box.max.z - box.min.z);
    ray.set(new THREE.Vector3(x, box.max.y + 1, z), down);
    const hit = ray.intersectObject(model, true)[0];
    const rgb = hit && colorAt(hit);
    if (rgb) samples.push({ x: x * scale[0], z: z * scale[2], rgb });
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return bowlSlotsFromSamples(samples, [center.x * scale[0], center.z * scale[2]], [size.x * scale[0], size.z * scale[2]]);
}
