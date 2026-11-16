// 虛擬飼養尿漬（#354）：地板上的扁平貼片，掃描房間（three）用；娃娃屋（R3F）用同一個輪廓。形狀與顏色在 lib/play/urine-stain.ts。
import * as THREE from "three";
import { blobOutline, STAIN } from "@/lib/play/urine-stain";

/** 貼片幾何：不規則的圓（x–y 平面） */
export function stainShape(id: string, r: number): THREE.Shape {
  const pts = blobOutline(id, r);
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** 一灘尿漬：外圈淡黃半透明＋中間一小塊深一點的；躺在地板上（y 朝上）。不吃燈光，夜晚也看得到 */
export function stainMesh(id: string, r: number): THREE.Group {
  const g = new THREE.Group();
  const mk = (shape: THREE.Shape, color: number, opacity: number, lift: number) => {
    const m = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = lift;
    m.renderOrder = 5;
    return m;
  };
  g.add(mk(stainShape(id, r), STAIN.color, STAIN.opacity, 0));
  g.add(mk(stainShape(`${id}-core`, r * 0.55), STAIN.core, STAIN.opacity, 0.003));
  return g;
}

export function disposeStains(frame: THREE.Group) {
  frame.traverse(o => {
    if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
  });
  frame.clear();
}
