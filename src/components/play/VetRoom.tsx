"use client";
// 虛擬飼養：診間（#354）。看獸醫（scene.bg＝vet）時 PlayStage 把這層疊在房間上面；房間不卸載，換回來不用重新下載。
// 零件、顏色、診療台高度在 lib/play/vet-room.ts。低多邊形、不開陰影；不在畫面上時 frameloop 停掉，不跟房間搶 GPU。
// 貓用和娃娃屋同一個 CatModel（劇情姿勢 table → idle 動作），坐在診療台上。
// 獸醫：程式建的 Q 版人物（零件與動作在 vet-room.ts 的 DOCTOR_PARTS／doctorPose），talk 一換（獸醫開口）就點兩下頭。
// 手臂（肩、肘）與聽頭由 vet-doctor.ts 的 doctorAct＋solveArm 每幀算：摸貓 → 聽診 → 拍背循環；說話時手放下。
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CatModel } from "@/components/hq/assets/CatPreview";
import { CAT_SCALE } from "@/lib/hq/floorplans/catwalk";
import type { PlayCatLook } from "@/lib/play/cats";
import type { SceneLight } from "@/lib/play/scene-light";
import { CAT_AT, CAT_YAW, DOCTOR_AT, DOCTOR_NECK_Y, DOCTOR_PARTS, doctorPose, TABLE_TOP, VET_COLORS, VET_PARTS, vetLight, type DoctorPart } from "@/lib/play/vet-room";
import { DOCTOR_ARM, doctorAct, solveArm, type V3 } from "@/lib/play/vet-doctor";

// 從右前方斜看診療台；看的點比檯面低一點，診療台落在畫面上半（下半常被劇情卡蓋住）。
// 手機直式畫面窄，鏡頭退遠一點，診療台和貓才不會被切掉
const LOOK_AT = new THREE.Vector3(TABLE_TOP.x - 0.15, TABLE_TOP.y - 0.2, TABLE_TOP.z);
// 窄畫面時看的點往貓和獸醫中間移、再壓低，獸醫不會被切掉，診療台落在劇情卡上方
const LOOK_NARROW = new THREE.Vector3((CAT_AT.x + DOCTOR_AT.pos[0]) / 2, TABLE_TOP.y - 0.5, (CAT_AT.z + DOCTOR_AT.pos[2]) / 2);
const CAM_DIR = new THREE.Vector3(1.4, 0.95, 2.3).normalize();
const camDist = (aspect: number) => 3.4 * Math.min(1.3, Math.max(1, 0.75 / aspect));

function Aim() {
  const camera = useThree(st => st.camera);
  const { width, height } = useThree(st => st.size);
  useEffect(() => {
    const aspect = width / Math.max(1, height);
    const look = LOOK_AT.clone().lerp(LOOK_NARROW, Math.min(1, Math.max(0, (1 - aspect) / 0.5)));
    camera.position.copy(look).addScaledVector(CAM_DIR, camDist(aspect));
    camera.lookAt(look);
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

const UP = new THREE.Vector3(0, 1, 0);
const CHEST: V3 = [0.12, 1.07, 0.2];
const CORD_TOP = new THREE.Vector3(0.12, 1.08, 0.17);
/** 把一段圓柱（高 1、沿 y）擺在 a→b 之間 */
function span(m: THREE.Object3D | null, a: THREE.Vector3, b: THREE.Vector3, tmp: THREE.Vector3) {
  if (!m) return;
  tmp.subVectors(b, a);
  const l = tmp.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, l > 1e-6 ? tmp.divideScalar(l) : UP);
  m.scale.set(1, Math.max(l, 1e-4), 1);
}

function Arm({ side, refs }: { side: "l" | "r"; refs: React.MutableRefObject<Record<string, THREE.Object3D | null>> }) {
  const set = (k: string) => (o: THREE.Object3D | null) => { refs.current[`${k}-${side}`] = o; };
  return (
    <>
      <mesh ref={set("upper")}><cylinderGeometry args={[0.062, 0.058, 1, 10]} /><meshStandardMaterial color={VET_COLORS.card} roughness={0.8} /></mesh>
      <mesh ref={set("elbow")}><sphereGeometry args={[0.058, 10, 8]} /><meshStandardMaterial color={VET_COLORS.card} roughness={0.8} /></mesh>
      <mesh ref={set("fore")}><cylinderGeometry args={[0.056, 0.05, 1, 10]} /><meshStandardMaterial color={VET_COLORS.card} roughness={0.8} /></mesh>
      <mesh ref={set("hand")}><sphereGeometry args={[0.055, 12, 10]} /><meshStandardMaterial color={VET_COLORS.orangeSoft} roughness={0.8} /></mesh>
    </>
  );
}

function Doctor({ talk, body: catBody }: { talk: string | null; body: string }) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const talkAt = useRef<number | null>(null);
  const clock = useThree(st => st.clock);
  useEffect(() => { talkAt.current = talk ? clock.getElapsedTime() : null; }, [talk, clock]);
  const parts = useRef<Record<string, THREE.Object3D | null>>({});
  // 手與聽頭目前的位置：每幀往 doctorAct 的目標靠近（換動作、開口時不會瞬間跳）
  const cur = useRef({ l: [...DOCTOR_ARM.restL] as number[], r: [...DOCTOR_ARM.restR] as number[], steth: [...CHEST] as number[] });
  const v = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), tmp: new THREE.Vector3() }), []);
  useFrame(({ clock: c }, dt) => {
    const t = c.getElapsedTime();
    const pose = doctorPose(t, talkAt.current === null ? null : t - talkAt.current, still);
    body.current?.scale.set(1, pose.breathe, 1);
    head.current?.rotation.set(pose.headPitch, pose.headYaw, 0);
    const act = doctorAct(t, { talking: Boolean(talk), still, body: catBody });
    const k = still ? 1 : Math.min(1, dt * 8);
    const ease = (from: number[], to: V3) => { for (let i = 0; i < 3; i++) from[i] += (to[i] - from[i]) * k; };
    ease(cur.current.l, act.left);
    ease(cur.current.r, act.right);
    for (const [side, s, h, sign] of [["l", DOCTOR_ARM.shoulderL, cur.current.l, -1], ["r", DOCTOR_ARM.shoulderR, cur.current.r, 1]] as const) {
      const { elbow, hand } = solveArm(s, h as unknown as V3, sign);
      v.a.set(...s); v.b.set(...elbow);
      span(parts.current[`upper-${side}`], v.a, v.b, v.tmp);
      parts.current[`elbow-${side}`]?.position.copy(v.b);
      v.a.set(...hand);
      span(parts.current[`fore-${side}`], v.b, v.a, v.tmp);
      parts.current[`hand-${side}`]?.position.copy(v.a);
    }
    // 聽診時聽頭貼在右手上（略往前），其他時候掛在胸前；線從胸前的管子連到聽頭
    const sh = parts.current["hand-r"]?.position;
    ease(cur.current.steth, act.steth && sh ? [sh.x, sh.y - 0.02, sh.z + 0.04] : CHEST);
    const st = parts.current.steth;
    if (st) st.position.set(cur.current.steth[0], cur.current.steth[1], cur.current.steth[2]);
    v.a.set(cur.current.steth[0], cur.current.steth[1], cur.current.steth[2]);
    span(parts.current.cord, CORD_TOP, v.a, v.tmp);
  });
  return (
    <group position={[...DOCTOR_AT.pos]} rotation={[0, DOCTOR_AT.yaw, 0]}>
      {/* 呼吸只縮放身體；頭不跟著縮放，另外放在脖子頂端 */}
      <group ref={body}>{BODY.map(p => <DoctorMesh key={p.id} p={p} />)}</group>
      <group ref={head} position={[0, DOCTOR_NECK_Y, 0]}>{HEAD.map(p => <DoctorMesh key={p.id} p={p} />)}</group>
      <Arm side="l" refs={parts} />
      <Arm side="r" refs={parts} />
      <mesh ref={o => { parts.current.steth = o; }} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.032, 0.032, 0.016, 12]} /><meshStandardMaterial color={VET_COLORS.yellow} roughness={0.6} /></mesh>
      <mesh ref={o => { parts.current.cord = o; }}><cylinderGeometry args={[0.011, 0.011, 1, 6]} /><meshStandardMaterial color={VET_COLORS.inkSoft} roughness={0.8} /></mesh>
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
      <Doctor talk={talk} body={look?.body ?? "kitten"} />
      {look && (
        <Suspense fallback={null}>
          <group position={[CAT_AT.x, CAT_AT.y, CAT_AT.z]} rotation={[0, CAT_YAW, 0]} scale={CAT_SCALE}>
            <CatModel baseUrl={look.baseUrl} albedoUrl={look.albedoUrl} clip="idle" follow={false} />
          </group>
        </Suspense>
      )}
    </Canvas>
  );
}
