import { CareIcon } from "../CareIcon";
import { useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { SkinnedMesh, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { newPetState, petResult, petStroke, type PetZone } from "@/lib/play/mini3d/pet-rules";
import { createPetHitRegions } from "@/lib/play/mini3d/pet-hit-regions";
import type { MiniCtx } from "../catgame/minis";
import { useScenePointer } from "./useScenePointer";
import styles from "./mini3d.module.css";

const MODEL = "/hq-cat-models/base/base_clips.glb";

function PetScene({ ran, onStroke }: {
  ran: boolean;
  onStroke: (zone: PetZone, distance: number, dt: number, touching: boolean) => void;
}) {
  const { scene, animations } = useGLTF(MODEL);
  const cat = useMemo(() => clone(scene), [scene]);
  const { actions } = useAnimations(animations, cat);
  const hitRegions = useRef<ReturnType<typeof createPetHitRegions> | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const group = useRef<import("three").Group>(null);

  const reduced = useRef(false);
  const recovery = useRef(0);
  useEffect(() => {
    const regions = createPetHitRegions(cat);
    hitRegions.current = regions;
    const idle = actions.idle;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced.current) idle?.reset().play();
    return () => {
      idle?.stop();
      hitRegions.current = null;
      regions.dispose();
      // clone 共用材質與幾何，但骨架屬於這次場景，可釋放其 bone texture。
      cat.traverse(object => {
        if (object instanceof SkinnedMesh) object.skeleton.dispose();
      });
    };
  }, [actions, cat]);

  useFrame((_, dt) => {
    if (ran && group.current && !reduced.current && group.current.position.x > -1.4) {
      group.current.position.x -= Math.min(dt, 0.1) * 1.1;
    }
    if (!ran && !pointer.current) {
      recovery.current += dt;
      if (recovery.current >= 0.1) {
        onStroke(null, 0, recovery.current, false);
        recovery.current = 0;
      }
    }
  });

  useScenePointer({
    down(event) {
      if (!ran && !pointer.current) {
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
      }
    },
    move(event, ray) {
      const last = pointer.current;
      if (ran || last?.id !== event.pointerId) return;
      const dt = (event.timeStamp - last.time) / 1000;
      if (dt <= 0) return;
      const distance = Math.hypot(event.clientX - last.x, event.clientY - last.y);
      onStroke(hitRegions.current?.hit(ray) ?? null, distance, dt, true);
      pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    },
    release(event) {
      if (pointer.current?.id === event.pointerId) pointer.current = null;
    },
    reset() { pointer.current = null; },
  });

  return <>
    <group ref={group}><primitive object={cat} /></group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={new Vector3(0, -0.006, 0)}>
      <circleGeometry args={[0.42, 40]} />
      <meshStandardMaterial color={0xd9ccb6} />
    </mesh>
  </>;
}

export function PetGame3D({ ctx, onDone }: { ctx: MiniCtx; onDone: (r: unknown) => void }) {
  const current = useRef(newPetState());
  const [state, setState] = useState(current.current);
  const favorite = ctx.touchFav ?? "head";
  const result = petResult(state);
  return <>
    <p className={styles.hint}>輕輕滑過頭、下巴或背部。貓咪不高興時先停手。</p>
    <div className={styles.scene}>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0.92, 0.52, 0.57], fov: 38, near: 0.02, far: 12 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.24, -0.025)}
        fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <hemisphereLight intensity={1.45} color={0xffffff} groundColor={0xd8c0a0} />
        <directionalLight position={[1, 2, 3]} intensity={1.65} />
        <Suspense fallback={null}>
          <PetScene ran={state.ran} onStroke={(zone, distancePx, dt, touching) => {
            if (!touching && current.current.annoyance === 0) return;
            current.current = petStroke(current.current, { zone, distancePx, dt, touching, favorite, ...ctx.cat });
            setState(current.current);
          }} />
        </Suspense>
      </Canvas>
    </div>
    <div className={styles.meters}>
      <label>開心 <progress max={100} value={result.fun} /> {result.fun}</label>
      <label>煩躁 <progress max={100} value={state.annoyance} /></label>
    </div>
    <p className={styles.status} role="status">{state.ran ? "貓咪跑走了" : state.annoyance >= 55 ? <><CareIcon id="hiss" /> 貓咪有點煩躁，先停一下</> : result.fun > 0 ? <><CareIcon id="heart" /> {result.fun >= 50 ? "貓咪很喜歡" : "貓咪放鬆了"}</> : ""}</p>
    <button className="btn" type="button" disabled={!state.ran && result.fun === 0 && state.annoyance === 0} onClick={() => onDone(petResult(current.current))}>結束摸貓</button>
  </>;
}
