"use client";
// 虛擬飼養：診間（#354）。看獸醫（scene.bg＝vet）時 PlayStage 把這層疊在房間上面；房間不卸載，換回來不用重新下載。
// 零件、顏色、診療台高度在 lib/play/vet-room.ts。低多邊形、不開陰影；不在畫面上時 frameloop 停掉，不跟房間搶 GPU。
// 貓用和娃娃屋同一個 CatModel（劇情姿勢 table → idle 動作），坐在診療台上。
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { CatModel } from "@/components/hq/assets/CatPreview";
import { CAT_SCALE } from "@/lib/hq/floorplans/catwalk";
import type { PlayCatLook } from "@/lib/play/cats";
import type { SceneLight } from "@/lib/play/scene-light";
import { TABLE_TOP, VET_COLORS, VET_PARTS, vetLight } from "@/lib/play/vet-room";

// 從右前方斜看診療台；看的點比檯面低一點，診療台落在畫面上半（下半常被劇情卡蓋住）。
// 手機直式畫面窄，鏡頭退遠一點，診療台和貓才不會被切掉
const LOOK_AT = new THREE.Vector3(TABLE_TOP.x - 0.15, TABLE_TOP.y - 0.2, TABLE_TOP.z);
const CAM_DIR = new THREE.Vector3(1.4, 0.95, 2.3).normalize();
const camDist = (aspect: number) => 3.4 * Math.min(1.3, Math.max(1, 0.75 / aspect));

function Aim() {
  const camera = useThree(st => st.camera);
  const { width, height } = useThree(st => st.size);
  useEffect(() => {
    camera.position.copy(LOOK_AT).addScaledVector(CAM_DIR, camDist(width / Math.max(1, height)));
    camera.lookAt(LOOK_AT);
  }, [camera, width, height]);
  return null;
}

export default function VetRoom({ look, light, active }: { look: PlayCatLook | null; light?: SceneLight["house"] | null; active: boolean }) {
  const l = vetLight(light);
  return (
    <Canvas frameloop={active ? "always" : "never"} dpr={[1, 1.5]} camera={{ position: [3, 2, 4], fov: 42, near: 0.05, far: 30 }}
      gl={{ antialias: false, powerPreference: "low-power" }} aria-hidden="true">
      <color attach="background" args={[VET_COLORS.paper]} />
      <Aim />
      <hemisphereLight args={[l.hemi.sky, l.hemi.ground, l.hemi.intensity]} />
      <ambientLight intensity={l.ambient} />
      <directionalLight position={[2, 4, 3]} intensity={l.sun.intensity} color={l.sun.color} />
      {/* 夜晚診療台上的小補光：一直掛著（白天強度 0），切換日夜時材質不用重新編譯 */}
      <pointLight position={[TABLE_TOP.x + 0.4, TABLE_TOP.y + 0.6, TABLE_TOP.z + 0.6]} intensity={l.catLight} color={l.catLightColor} distance={1.6} decay={1} />
      {VET_PARTS.map(p => (
        <mesh key={p.id} position={[...p.pos]}>
          {p.shape === "box"
            ? <boxGeometry args={[...p.size]} />
            : <cylinderGeometry args={[p.size[0] / 2, p.size[2] / 2, p.size[1], 16]} />}
          <meshStandardMaterial color={p.color} roughness={0.85} />
        </mesh>
      ))}
      {look && (
        <Suspense fallback={null}>
          <group position={[TABLE_TOP.x, TABLE_TOP.y, TABLE_TOP.z]} rotation={[0, 0.6, 0]} scale={CAT_SCALE}>
            <CatModel baseUrl={look.baseUrl} albedoUrl={look.albedoUrl} clip="idle" follow={false} />
          </group>
        </Suspense>
      )}
    </Canvas>
  );
}
