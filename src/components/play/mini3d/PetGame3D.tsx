import { CareIcon } from "../CareIcon";
import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { SkinnedMesh, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { newPetState, petResult, petStroke, type PetZone } from "@/lib/play/mini3d/pet-rules";
import { createPetHitRegions } from "@/lib/play/mini3d/pet-hit-regions";
import { newPetReaction, petReaction } from "@/lib/play/mini3d/pet-reactions";
import type { MiniCtx } from "../catgame/minis";
import { useScenePointer } from "./useScenePointer";
import { createPetMotion } from "./pet-motion";
import styles from "./mini3d.module.css";

const MODEL = "/hq-cat-models/base/base_clips.glb";

function PetScene({ game, favorite, onStroke }: {
  game: { current: ReturnType<typeof newPetState> };
  favorite: NonNullable<MiniCtx["touchFav"]>;
  onStroke: (zone: PetZone, distance: number, dt: number, touching: boolean) => boolean;
}) {
  const { scene, animations } = useGLTF(MODEL);
  const cat = useMemo(() => clone(scene), [scene]);
  const hitRegions = useRef<ReturnType<typeof createPetHitRegions> | null>(null);
  const motion = useRef<ReturnType<typeof createPetMotion> | null>(null);
  const reaction = useRef(newPetReaction());
  const pointer = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const group = useRef<import("three").Group>(null);

  const reduced = useRef(false);
  const recovery = useRef(0);
  useEffect(() => {
    const regions = createPetHitRegions(cat);
    hitRegions.current = regions;
    const animation = createPetMotion(cat, animations);
    motion.current = animation;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => { reduced.current = preference.matches; };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => {
      preference.removeEventListener("change", updatePreference);
      motion.current = null;
      animation.dispose();
      hitRegions.current = null;
      regions.dispose();
      // clone 共用材質與幾何，但骨架屬於這次場景，可釋放其 bone texture。
      cat.traverse(object => {
        if (object instanceof SkinnedMesh) object.skeleton.dispose();
      });
    };
  }, [animations, cat]);

  useFrame((_, dt) => {
    const { ran, annoyance } = game.current;
    if (!ran && !pointer.current && annoyance > 0) {
      recovery.current += dt;
      if (recovery.current >= 0.1) {
        onStroke(null, 0, recovery.current, false);
        recovery.current = 0;
      }
    }
    reaction.current = petReaction(reaction.current, { dt, annoyance: game.current.annoyance, ran });
    if (group.current) motion.current?.step(Math.min(dt, 0.05), reaction.current.pose, reduced.current, group.current);
  });

  useScenePointer({
    down(event) {
      if (!game.current.ran && !pointer.current) {
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
      }
    },
    move(event, ray) {
      const last = pointer.current;
      if (game.current.ran || last?.id !== event.pointerId) return;
      const dt = (event.timeStamp - last.time) / 1000;
      if (dt <= 0) return;
      const distance = Math.hypot(event.clientX - last.x, event.clientY - last.y);
      const zone = hitRegions.current?.hit(ray) ?? null;
      const gentle = onStroke(zone, distance, dt, true);
      if (zone === favorite && gentle) {
        reaction.current = petReaction(reaction.current, { dt, annoyance: game.current.annoyance, favoriteStroke: true });
      }
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
          <PetScene game={current} favorite={favorite} onStroke={(zone, distancePx, dt, touching) => {
            const previous = current.current;
            const next = petStroke(previous, { zone, distancePx, dt, touching, favorite, ...ctx.cat });
            current.current = next;
            if (next.fun !== previous.fun || next.annoyance !== previous.annoyance || next.ran !== previous.ran) setState(next);
            return distancePx > 0 && (next.fun > previous.fun
              || (next.fun === 100 && next.annoyance <= previous.annoyance));
          }} />
        </Suspense>
      </Canvas>
    </div>
    <div className={styles.meters}>
      <label>開心 <progress max={100} value={result.fun} /> {result.fun}</label>
      <label>煩躁 <progress max={100} value={state.annoyance} /></label>
    </div>
    <p className={styles.status} role="status">{state.ran ? "貓咪離開了" : state.annoyance >= 55 ? <><CareIcon id="hiss" /> 貓咪開始抗拒，請停止撫摸，讓牠自己選擇是否繼續互動。</> : result.fun > 0 ? <><CareIcon id="heart" /> {result.fun >= 50 ? "貓咪很喜歡" : "貓咪放鬆了"}</> : ""}</p>
    <button className="btn" type="button" disabled={!state.ran && result.fun === 0 && state.annoyance === 0} onClick={() => onDone(petResult(current.current))}>結束摸貓</button>
  </>;
}
