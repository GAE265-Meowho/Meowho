import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type PointerEvent as ReactPointerEvent } from "react";
import { SkinnedMesh, SRGBColorSpace, TextureLoader, Vector3, type Mesh, type MeshStandardMaterial } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { newPetState, petResult, petStroke, type PetZone } from "@/lib/play/mini3d/pet-rules";
import { createPetHitRegions } from "@/lib/play/mini3d/pet-hit-regions";
import { newPetReaction, petReaction } from "@/lib/play/mini3d/pet-reactions";
import { PET_LESSONS, petCue } from "@/lib/play/mini3d/pet-learning";
import type { MiniCtx } from "../catgame/minis";
import { PET_VIEW, petOrbit, stickTurn } from "@/lib/play/mini3d/pet-view";
import { useScenePointer } from "./useScenePointer";
import { createPetMotion } from "./pet-motion";
import styles from "./mini3d.module.css";

const ZONE_LABELS = { head: "頭部", chin: "下巴", back: "背部", belly: "肚子", tail: "尾巴" };
const CAMERA_START: [number, number, number] = [0.92, 0.52, 0.57];
const CAMERA_TARGET: [number, number, number] = [0, 0.24, -0.025];
const MODEL = "/hq-cat-models/base/base_clips.glb";
/** 游標是虛擬手（渝茜 2026-11-16）：平常張開、摸的時候彎下來；熱點在中指指尖 */
const HAND = { open: "url(/play/pet/hand-open.svg) 22 3, pointer", pet: "url(/play/pet/hand-pet.svg) 22 3, grabbing" };

function PetScene({ game, favorite, furUrl, onStroke, controls, onZone, onPose, onRelease }: {
  furUrl?: string | null;
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
  // 這隻貓自己的花色（渝茜 2026-11-16：原本每隻貓都是同一隻虎斑）；材質先複製，不動到快取裡的母體
  useEffect(() => {
    if (!furUrl) return;
    let alive = true;
    new TextureLoader().loadAsync(furUrl).then(tex => {
      if (!alive) return;
      tex.flipY = false;
      tex.colorSpace = SRGBColorSpace;
      cat.traverse(o => {
        const m = o as Mesh;
        if (!m.isMesh || Array.isArray(m.material) || m.material.name !== "cat_fur") return;
        const mat = (m.material as MeshStandardMaterial).clone();
        mat.map = tex;
        mat.needsUpdate = true;
        m.material = mat;
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, [cat, furUrl]);
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
    canvas.style.cursor = pointer.current ? HAND.pet : HAND.open;
    onZone(zone);
  }

  useEffect(() => {
    canvas.style.cursor = HAND.open;
    return () => { canvas.style.removeProperty("cursor"); };
  }, [canvas]);

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
        canvas.style.cursor = HAND.pet;  // 按下去就是在摸：手彎下來
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
    {/* 滑鼠只摸貓、不轉畫面（渝茜 2026-11-16）：轉視角用左下角的搖桿（petOrbit），這裡只留滾輪縮放 */}
    <OrbitControls ref={controls} domElement={canvas} target={CAMERA_TARGET}
      enableRotate={false} enablePan={false} enableDamping={false} minDistance={0.85} maxDistance={1.55}
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
    <div className={`${styles.scene} ${styles.petScene}`}>
      <Canvas dpr={[1, 1.5]} camera={{ position: CAMERA_START, fov: 38, near: 0.02, far: 12 }}
        onCreated={({ camera }) => camera.lookAt(...CAMERA_TARGET)}
        fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <hemisphereLight intensity={1.45} color={0xffffff} groundColor={0xd8c0a0} />
        <directionalLight position={[1, 2, 3]} intensity={1.65} />
        <Suspense fallback={null}>
          <PetScene game={current} favorite={favorite} furUrl={ctx.furUrl} controls={controls} onZone={setZone} onPose={setPose}
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
      <ViewStick controls={controls} />
    </div>
    <div className={styles.petControls}>
      <p className={styles.hint}>{zone
        ? ZONE_LABELS[zone] + " · " + (zone === favorite ? "這隻貓的偏好部位" : zone === "belly" || zone === "tail" ? "先避開" : "輕摸並觀察")
        : "用左下角的搖桿（或鍵盤方向鍵）轉動視角。可先輕摸頭或下巴。"}</p>
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

/** 左下角的搖桿（#456，渝茜：原本右邊的方向鍵換成搖桿）：按住旋鈕往想看的方向推，貓就跟著轉；推越遠轉越快。鍵盤方向鍵也可以 */
const STICK_SIZE = 104, KNOB_SIZE = 44;
function ViewStick({ controls }: { controls: { current: ComponentRef<typeof OrbitControls> | null } }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const vec = useRef({ yaw: 0, pitch: 0 });
  const turn = useCallback((yaw: number, pitch: number) => {
    const orbit = controls.current;
    if (!orbit) return;
    const p = orbit.object.position, t = orbit.target;
    orbit.object.position.set(...petOrbit([p.x, p.y, p.z], [t.x, t.y, t.z], yaw, pitch));
    orbit.update();
  }, [controls]);
  const stop = useCallback(() => {
    if (timer.current !== null) { clearInterval(timer.current); timer.current = null; }
    vec.current = { yaw: 0, pitch: 0 };
    if (knob.current) knob.current.style.transform = "translate(0, 0)";
  }, []);
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = base.current?.getBoundingClientRect();
    if (!box) return;
    const radius = (STICK_SIZE - KNOB_SIZE) / 2;
    const s = stickTurn(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2), radius);
    vec.current = { yaw: s.yaw, pitch: s.pitch };
    if (knob.current) knob.current.style.transform = `translate(${s.x * radius}px, ${s.y * radius}px)`;
  };
  useEffect(() => {
    const keys: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const down = (e: KeyboardEvent) => {
      const k = keys[e.code];
      if (!k || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      turn(...k);
    };
    window.addEventListener("keydown", down);
    return () => { window.removeEventListener("keydown", down); stop(); };
  }, [turn, stop]);
  return (
    <div ref={base} className={styles.viewStick} role="application" aria-label="搖桿：往想看的方向推，轉動視角"
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        stop();
        move(e);
        timer.current = window.setInterval(() => { const v = vec.current; if (v.yaw || v.pitch) turn(v.yaw, v.pitch); }, PET_VIEW.repeatMs);
      }}
      onPointerMove={e => { if (timer.current !== null) move(e); }}
      onPointerUp={stop} onPointerCancel={stop} onContextMenu={e => e.preventDefault()}>
      <span ref={knob} className={styles.stickKnob} />
    </div>
  );
}
