import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { SkinnedMesh, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { newPetState, petResult, petStroke, type PetZone } from "@/lib/play/mini3d/pet-rules";
import { createPetHitRegions } from "@/lib/play/mini3d/pet-hit-regions";
import { newPetReaction, petReaction } from "@/lib/play/mini3d/pet-reactions";
import { PET_LESSONS, petCue } from "@/lib/play/mini3d/pet-learning";
import type { MiniCtx } from "../catgame/minis";
import { useScenePointer } from "./useScenePointer";
import { createPetMotion } from "./pet-motion";
import styles from "./mini3d.module.css";

const ZONE_LABELS = { head: "頭部", chin: "下巴", back: "背部", belly: "肚子", tail: "尾巴" };
const CAMERA_START: [number, number, number] = [0.92, 0.52, 0.57];
const CAMERA_TARGET: [number, number, number] = [0, 0.24, -0.025];
const MODEL = "/hq-cat-models/base/base_clips.glb";

function PetScene({ game, favorite, onStroke, controls, onZone, onPose, onRelease }: {
  game: { current: ReturnType<typeof newPetState> };
  favorite: NonNullable<MiniCtx["touchFav"]>;
  controls: { current: ComponentRef<typeof OrbitControls> | null };
  onZone: (zone: PetZone) => void;
  onRelease: () => void;
  onPose: (pose: ReturnType<typeof newPetReaction>["pose"]) => void;
  onStroke: (zone: PetZone, distance: number, dt: number, touching: boolean) => boolean;
}) {
  const canvas = useThree(state => state.gl.domElement);
  const orbiting = useRef(false);
  const lastPose = useRef(newPetReaction().pose);
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
    const pose = reaction.current.pose;
    if (pose !== lastPose.current) {
      lastPose.current = pose;
      onPose(pose);
    }
    if (group.current) motion.current?.step(Math.min(dt, 0.05), pose, reduced.current, group.current,
      Math.min(1, Math.max(0, (game.current.annoyance - 28) / 27)));
  });

  function showZone(zone: PetZone) {
    canvas.style.cursor = orbiting.current ? "grabbing" : zone ? "pointer" : "grab";
    onZone(zone);
  }

  useEffect(() => () => { canvas.style.removeProperty("cursor"); }, [canvas]);

  useScenePointer({
    claim(_event, ray) {
      if (game.current.ran || orbiting.current) return false;
      const zone = hitRegions.current?.hit(ray, true) ?? null;
      if (!zone) return false;
      if (controls.current) controls.current.enabled = false;
      showZone(zone);
      return true;
    },
    hover(_event, ray) {
      showZone(game.current.ran || orbiting.current ? null : hitRegions.current?.hit(ray, true) ?? null);
    },
    leave() { showZone(null); },
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
      const zone = hitRegions.current?.hit(ray, true) ?? null;
      showZone(zone);
      const gentle = onStroke(zone, distance, dt, true);
      if (zone === favorite && gentle) {
        reaction.current = petReaction(reaction.current, { dt, annoyance: game.current.annoyance, favoriteStroke: true });
      }
      pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    },
    release(event) {
      if (pointer.current?.id !== event.pointerId) return;
      pointer.current = null;
      if (controls.current) controls.current.enabled = true;
      showZone(null);
      onRelease();
    },
    reset() {
      pointer.current = null;
      orbiting.current = false;
      if (controls.current) controls.current.enabled = true;
    },
  });

  return <>
    <OrbitControls ref={controls} domElement={canvas} target={CAMERA_TARGET}
      enablePan={false} enableDamping={false} minDistance={0.85} maxDistance={1.55}
      minPolarAngle={0.48} maxPolarAngle={Math.PI / 2 - 0.12}
      onStart={() => { orbiting.current = true; showZone(null); }}
      onEnd={() => { orbiting.current = false; showZone(null); }} />
    <group ref={group} dispose={null}><primitive object={cat} /></group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={new Vector3(0, -0.006, 0)}>
      <circleGeometry args={[0.42, 40]} />
      <meshStandardMaterial color={0xc5cbb5} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.014, 0]}>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color={0xe9d6bc} />
    </mesh>
  </>;
}

export function PetGame3D({ ctx, onDone }: { ctx: MiniCtx; onDone: (r: unknown) => void }) {
  const current = useRef(newPetState());
  const [state, setState] = useState(current.current);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [zone, setZone] = useState<PetZone>(null);
  const [pose, setPose] = useState(newPetReaction().pose);
  const favorite = ctx.touchFav ?? "head";
  const result = petResult(state);
  const [paused, setPaused] = useState(false);
  const [pauseDue, setPauseDue] = useState(false);
  const seconds = useRef(0);
  const interacted = useRef(false);
  const cue = state.ran ? "leaving" : !interacted.current ? "invite" : petCue(pose, state.annoyance, paused, pauseDue);
  const lesson = PET_LESSONS[cue];

  return <>
    <p className={styles.hint}>輕輕撫摸，觀察牠是否想繼續。</p>
    <div className={styles.scene}>
      <Canvas dpr={[1, 1.5]} camera={{ position: CAMERA_START, fov: 38, near: 0.02, far: 12 }}
        onCreated={({ camera }) => camera.lookAt(...CAMERA_TARGET)}
        fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <hemisphereLight intensity={1.45} color={0xffffff} groundColor={0xd8c0a0} />
        <directionalLight position={[1, 2, 3]} intensity={1.65} />
        <Suspense fallback={null}>
          <PetScene game={current} favorite={favorite} controls={controls} onZone={setZone} onPose={setPose}
            onRelease={() => {
              setPaused(seconds.current >= 3 || current.current.annoyance >= 28);
              seconds.current = 0;
              setPauseDue(false);
            }} onStroke={(zone, distancePx, dt, touching) => {
            if (touching && zone && distancePx > 0) {
              interacted.current = true;
              setPaused(false);
              seconds.current += Math.min(dt, 0.1);
              if (seconds.current >= 3) setPauseDue(true);
            }
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
    <div className={styles.petControls}>
      <p className={styles.hint}>{zone
        ? ZONE_LABELS[zone] + " · " + (zone === favorite ? "這隻貓的偏好部位" : zone === "belly" || zone === "tail" ? "先避開" : "輕摸並觀察")
        : "拖曳背景轉動視角。可先輕摸頭或下巴。"}</p>
      <button className="btn ghost" type="button" onClick={() => {
        const orbit = controls.current;
        if (!orbit?.enabled) return;
        orbit.object.position.set(...CAMERA_START);
        orbit.target.set(...CAMERA_TARGET);
        orbit.update();
        setZone(null);
      }}>重設視角</button>
    </div>
    <div className={styles.meters}>
      <label>開心 <progress max={100} value={result.fun} /> {result.fun}</label>
      <label>煩躁 <progress max={100} value={state.annoyance} /></label>
    </div>
    <section className={styles.petLesson}>
      <p role="status">{lesson.hint}</p>
      <details><summary>為什麼？</summary><p>{lesson.detail} <a href={lesson.source} target="_blank" rel="noreferrer">閱讀資料來源</a></p></details>
    </section>
    <button className="btn" type="button" onClick={() => {
      onDone(interacted.current ? petResult(current.current) : null);
    }}>結束互動</button>
  </>;
}
