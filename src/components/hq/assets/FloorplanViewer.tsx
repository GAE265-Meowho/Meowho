"use client";
// 平面圖 → 3D 娃娃屋（#138 步驟 4，規格 docs/hq/05 §6）：讀圖完成的房間並排，無天花板，可旋轉縮放。
// 場景資料在 src/lib/hq/floorplans/scene.ts（純函式、可測）；這裡只照著畫方塊。點地板或上方房名＝選那間房。
// 用 next/dynamic（ssr: false）載入；不改動 Gaussian Splat 用的 RoomViewer。
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { houseScene, sceneBounds, type SceneBox } from "@/lib/hq/floorplans/scene";
import type { PlanRoom } from "@/lib/hq/floorplans/types";

// Nordic Meow 色系：牆象牙白、地板淺木、選中的房間地板鼠尾草綠
const COLORS = { wall: "#F3EFE7", floor: "#DCCBAE", floorOn: "#C9D8C6", glass: "#9CC3D5" };
const FURNITURE: Record<string, string> = {
  sofa: "#8FA58F", bed: "#C9B7D6", table: "#B08A63", chair: "#9B7B5B", desk: "#B08A63", wardrobe: "#8C7A68",
  cabinet: "#A88F74", tv_stand: "#6F6A64", counter: "#A7A29A", toilet: "#E9EEF0", bathtub: "#DCE7EC", other: "#B9B2A8",
};

function Box({ b, color, onClick }: { b: SceneBox; color: string; onClick?: () => void }) {
  const glass = b.kind === "glass";
  return (
    <mesh position={[b.x, b.y, b.z]} rotation={[0, b.rotY, 0]} castShadow={!glass} receiveShadow onClick={onClick ? e => { e.stopPropagation(); onClick(); } : undefined}>
      <boxGeometry args={[b.sx, b.sy, b.sz]} />
      <meshStandardMaterial color={color} transparent={glass} opacity={glass ? 0.35 : 1} roughness={0.85} />
    </mesh>
  );
}

const colorOf = (b: SceneBox, on: boolean) =>
  b.kind === "floor" ? (on ? COLORS.floorOn : COLORS.floor)
    : b.kind === "glass" ? COLORS.glass
      : b.kind === "furniture" ? FURNITURE[b.furniture ?? "other"] ?? FURNITURE.other
        : COLORS.wall;

export default function FloorplanViewer({ rooms, selected, onPick }: { rooms: PlanRoom[]; selected: string | null; onPick: (id: string) => void }) {
  const scenes = useMemo(() => houseScene(rooms), [rooms]);
  const { width, depth, height } = sceneBounds(scenes);
  const center: [number, number, number] = [width / 2, 0, depth / 2];
  const reach = Math.max(width, depth, 3);

  return (
    <div className="hq-fp-3dwrap">
      {/* 房名放在 3D 上方：浮在場景裡的標籤在 React 19 會掉，手機也不好點 */}
      <div className="hq-row hq-fp-3dnames" role="group" aria-label="選房間">
        {scenes.map(s => (
          <button key={s.id} type="button" className={`hq-fp-3dlabel${s.id === selected ? " on" : ""}`} aria-pressed={s.id === selected} onClick={() => onPick(s.id)}>{s.name}</button>
        ))}
      </div>
      <div className="hq-fp-3d">
        {/* 鏡頭偏高往下看，前面的牆才不會擋住房間裡的家具 */}
        <Canvas shadows camera={{ position: [width / 2, reach * 1.0 + height, depth / 2 + reach * 0.5], fov: 40, near: 0.1, far: 500 }}>
          <color attach="background" args={["#FAF7F0"]} />
          <hemisphereLight args={["#ffffff", "#d9cfbf", 0.9]} />
          <directionalLight position={[width, reach * 2, depth + reach]} intensity={1.1} castShadow />
          {scenes.map(s => (
            <group key={s.id} position={[s.offset[0], 0, s.offset[1]]}>
              {s.boxes.map((b, i) => (
                <Box key={i} b={b} color={colorOf(b, s.id === selected)} onClick={b.kind === "floor" ? () => onPick(s.id) : undefined} />
              ))}
            </group>
          ))}
          <OrbitControls target={center} maxPolarAngle={Math.PI / 2.1} minDistance={2} maxDistance={reach * 4} makeDefault />
        </Canvas>
      </div>
    </div>
  );
}
