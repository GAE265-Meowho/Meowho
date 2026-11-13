"use client";
// 虛擬飼養第 1 份：鏟屎特寫用的道具，用程式畫（不載模型）。尺寸是公尺。
//   LitterBox（litter_box_open／covered／large／kitten）：貓砂盆四款，原點在盆底中心；砂面高度是 sandY(kind)
//   ScoopShovel（scoop_shovel）：貓砂鏟，原點在握把中心，握把沿 X、鏟頭在 +X 那一端（SCOOP_HEAD）
//   TrashBag（scoop_bag）：垃圾袋，原點在袋底中心，袋口朝上
//   ClumpMesh（scoop_poop／scoop_clump）：大便是一條、結塊是一坨
import { useMemo } from "react";
import { DoubleSide, LatheGeometry, Object3D, Vector2 } from "three";
import { LITTER_BOXES, type LitterBoxKind } from "@/lib/play/mini3d/scoop-rules";

const WALL = 0.012;
/** 砂面離盆底多高：盆壁的一半，最多 5 公分 */
export const sandY = (kind: LitterBoxKind) => Math.min(0.05, LITTER_BOXES[kind].h * 0.5);
/** 鏟頭中心離握把中心多遠 */
export const SCOOP_HEAD = 0.13;
export const BAG = { r: 0.09, h: 0.17 };

export function LitterBox({ kind }: { kind: LitterBoxKind }) {
  const { w, d, h } = LITTER_BOXES[kind], sand = sandY(kind);
  // 砂面上的顆粒：固定的位置，鋪滿砂面
  const grains = useMemo(() => {
    const o = new Object3D();
    return Array.from({ length: 140 }, (_, i) => {
      const a = i * 2.399963, f = Math.sqrt((i + 0.5) / 140);
      o.position.set(Math.cos(a) * f * (w / 2 - WALL - 0.01) * 1.2, sand + 0.001, Math.sin(a) * f * (d / 2 - WALL - 0.01) * 1.2);
      o.position.x = Math.max(-w / 2 + WALL + 0.008, Math.min(w / 2 - WALL - 0.008, o.position.x));
      o.position.z = Math.max(-d / 2 + WALL + 0.008, Math.min(d / 2 - WALL - 0.008, o.position.z));
      o.scale.setScalar(0.6 + (i % 5) * 0.2);
      o.updateMatrix();
      return o.matrix.clone();
    });
  }, [w, d, sand]);
  const tray = <meshStandardMaterial color={0x9fb6c9} roughness={0.6} />;
  return <group>
    <mesh position={[0, WALL / 2, 0]}><boxGeometry args={[w, WALL, d]} />{tray}</mesh>
    {[[0, d / 2 - WALL / 2, w, WALL], [0, -d / 2 + WALL / 2, w, WALL], [w / 2 - WALL / 2, 0, WALL, d], [-w / 2 + WALL / 2, 0, WALL, d]].map(([x, z, sx, sz], i) => (
      <mesh key={i} position={[x, h / 2, z]}><boxGeometry args={[sx, h, sz]} />{tray}</mesh>
    ))}
    <mesh position={[0, sand / 2 + WALL / 2, 0]}><boxGeometry args={[w - WALL * 2, sand - WALL, d - WALL * 2]} /><meshStandardMaterial color={0xd8cbb0} roughness={1} /></mesh>
    <instancedMesh args={[undefined, undefined, grains.length]} ref={(m) => { if (m) { grains.forEach((g, i) => m.setMatrixAt(i, g)); m.instanceMatrix.needsUpdate = true; } }}>
      <sphereGeometry args={[0.0035, 6, 4]} />
      <meshStandardMaterial color={0xbfae8c} roughness={1} />
    </instancedMesh>
    {/* 有蓋款：後半邊的罩子，半透明才看得到裡面 */}
    {kind === "covered" && <mesh position={[0, h + 0.11, -d / 4]}>
      <boxGeometry args={[w, 0.22, d / 2]} />
      <meshStandardMaterial color={0x9fb6c9} transparent opacity={0.35} roughness={0.6} side={DoubleSide} />
    </mesh>}
  </group>;
}

export function ScoopShovel() {
  const plastic = <meshStandardMaterial color={0x5fa8a0} roughness={0.5} />;
  return <group>
    {/* 握把：粗細和握把手手勢（grip）一樣 */}
    <mesh rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[0.011, 0.09, 4, 12]} />{plastic}</mesh>
    <mesh position={[0.075, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.006, 0.008, 0.04, 10]} />{plastic}</mesh>
    {/* 鏟頭：淺盤，三邊有矮牆，底部有漏砂的縫 */}
    <group position={[SCOOP_HEAD, 0, 0]}>
      <mesh><boxGeometry args={[0.085, 0.003, 0.07]} />{plastic}</mesh>
      {[-0.024, -0.008, 0.008, 0.024].map((z) => <mesh key={z} position={[0.004, 0.0018, z]}><boxGeometry args={[0.06, 0.001, 0.005]} /><meshStandardMaterial color={0x2f6f69} /></mesh>)}
      <mesh position={[0, 0.008, 0.035]}><boxGeometry args={[0.085, 0.016, 0.003]} />{plastic}</mesh>
      <mesh position={[0, 0.008, -0.035]}><boxGeometry args={[0.085, 0.016, 0.003]} />{plastic}</mesh>
      <mesh position={[-0.0425, 0.008, 0]}><boxGeometry args={[0.003, 0.016, 0.07]} />{plastic}</mesh>
    </group>
  </group>;
}

export function TrashBag() {
  const geometry = useMemo(() => new LatheGeometry(
    [[0.02, 0], [0.07, 0.008], [BAG.r * 0.95, 0.08], [BAG.r * 0.9, BAG.h - 0.02], [BAG.r, BAG.h]].map(([r, y]) => new Vector2(r, y)), 28), []);
  return <group>
    <mesh geometry={geometry}><meshStandardMaterial color={0x8a8f98} roughness={0.7} side={DoubleSide} /></mesh>
    <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.07, 24]} /><meshStandardMaterial color={0x6f747c} roughness={0.8} /></mesh>
  </group>;
}

export function ClumpMesh({ poop, r }: { poop: boolean; r: number }) {
  return poop
    ? <mesh rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[r * 0.7, r * 2.2, 4, 10]} /><meshStandardMaterial color={0x6b4a2b} roughness={0.8} /></mesh>
    : <mesh scale={[1, 0.7, 1]}><icosahedronGeometry args={[r, 1]} /><meshStandardMaterial color={0xa89a7c} roughness={1} flatShading /></mesh>;
}
