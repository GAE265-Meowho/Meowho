"use client";
// 虛擬飼養：診間（#354）。看獸醫（scene.bg＝vet）時 PlayStage 把這層疊在房間上面；房間不卸載，換回來不用重新下載。
// 零件、顏色、診療台高度在 lib/play/vet-room.ts。低多邊形、不開陰影；不在畫面上時 frameloop 停掉，不跟房間搶 GPU。
// 貓用和娃娃屋同一個 CatModel（劇情姿勢 table → idle 動作），坐在診療台上。
// 獸醫：程式建的 Q 版人物（零件與動作在 vet-room.ts 的 DOCTOR_PARTS／doctorPose），talk 一換（獸醫開口）就點兩下頭。
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CatModel } from "@/components/hq/assets/CatPreview";
import { CAT_SCALE } from "@/lib/hq/floorplans/catwalk";
import type { PlayCatLook } from "@/lib/play/cats";
import type { SceneLight } from "@/lib/play/scene-light";
import { DOCTOR_AT, DOCTOR_NECK_Y, DOCTOR_PARTS, doctorPose, TABLE_TOP, VET_COLORS, VET_PARTS, vetLight, type DoctorPart } from "@/lib/play/vet-room";

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

function DoctorMesh({ p }: { p: DoctorPart }) {
  const a = p.args;
  return (
    <mesh position={[...p.pos]} rotation={p.rot ? [...p.rot] : undefined}>
      {p.shape === "box" && <boxGeometry args={[a[0], a[1], a[2]]} />}
      {p.shape === "cyl" && <cylinderGeometry args={[a[0], a[1], a[2], 12]} />}
      {p.shape === "sphere" && <sphereGeometry args={[a[0], 16, 12]} />}
      {p.shape === "cap" && <sphereGeometry args={[a[0], 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />}
      {p.shape === "torus" && <torusGeometry args={[a[0], a[1], 6, 16, a[2]]} />}
      <meshStandardMaterial color={p.color} roughness={0.8} />
    </mesh>
  );
}

const BODY = DOCTOR_PARTS.filter(p => p.on === "body");
const HEAD = DOCTOR_PARTS.filter(p => p.on === "head");

function Doctor({ talk }: { talk: string | null }) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const talkAt = useRef<number | null>(null);
  const clock = useThree(st => st.clock);
  useEffect(() => { talkAt.current = talk ? clock.getElapsedTime() : null; }, [talk, clock]);
  useFrame(({ clock: c }) => {
    const t = c.getElapsedTime();
    const pose = doctorPose(t, talkAt.current === null ? null : t - talkAt.current, still);
    body.current?.scale.set(1, pose.breathe, 1);
    head.current?.rotation.set(pose.headPitch, pose.headYaw, 0);
  });
  return (
    <group position={[...DOCTOR_AT.pos]} rotation={[0, DOCTOR_AT.yaw, 0]}>
      {/* 呼吸只縮放身體；頭不跟著縮放，另外放在脖子頂端 */}
      <group ref={body}>{BODY.map(p => <DoctorMesh key={p.id} p={p} />)}</group>
      <group ref={head} position={[0, DOCTOR_NECK_Y, 0]}>{HEAD.map(p => <DoctorMesh key={p.id} p={p} />)}</group>
    </group>
  );
}

export default function VetRoom({ look, light, active, talk = null }: { look: PlayCatLook | null; light?: SceneLight["house"] | null; active: boolean;
  /** 獸醫在說話的卡片 key（lib/play/vet-room.ts 的 vetTalkKey）；一換就點頭 */
  talk?: string | null }) {
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
      <Doctor talk={talk} />
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
