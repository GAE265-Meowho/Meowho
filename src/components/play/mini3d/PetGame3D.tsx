import { CareIcon } from "../CareIcon";
import { useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3, type Raycaster } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { newPetState, petResult, petStroke, type PetZone } from "@/lib/play/mini3d/pet-rules";
import type { MiniCtx } from "../catgame/minis";
import { useScenePointer } from "./useScenePointer";
import styles from "./mini3d.module.css";

const MODEL = "/hq-cat-models/base/base_clips.glb";
// 位置是母體 GLB 的公尺座標，代理區在靜止姿勢綁到各骨架節點。
const regions = [
  ["head", "head0", [0.018, 0.408, 0.173], [0.081, 0.067, 0.072]],
  ["chin", "jaw", [0.02, 0.341, 0.205], [0.052, 0.026, 0.038]],
  ["back", "body_bot", [0.021, 0.302, -0.056], [0.097, 0.065, 0.161]],
  ["belly", "body_bot", [0.021, 0.212, -0.058], [0.082, 0.052, 0.135]],
  ["tail", "tail1", [-0.034, 0.229, -0.228], [0.043, 0.043, 0.046]],
  ["tail", "tail3", [-0.056, 0.168, -0.266], [0.041, 0.046, 0.041]],
  ["tail", "tail5", [-0.102, 0.12, -0.313], [0.042, 0.041, 0.041]],
] as const;

function PetScene({ ran, onStroke }: {
  ran: boolean;
  onStroke: (zone: PetZone, distance: number, dt: number, touching: boolean) => void;
}) {
  const { scene, animations } = useGLTF(MODEL);
  const cat = useMemo(() => clone(scene), [scene]);
  const { actions } = useAnimations(animations, cat);
  const proxies = useRef<Mesh[]>([]);
  const pointer = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const group = useRef<import("three").Group>(null);

  const reduced = useRef(false);
  const recovery = useRef(0);
  useEffect(() => {
    const white = new MeshStandardMaterial({ color: 0xeae4db, roughness: 0.86 });
    const geometry = new SphereGeometry(1, 12, 8);
    const invisible = new MeshBasicMaterial();
    const originals = new Map<Mesh, Mesh["material"]>();
    cat.traverse(object => {
      if (object instanceof Mesh && !object.name.startsWith("eye_")) {
        originals.set(object, object.material);
        object.material = white;
      }
    });
    // 將公尺座標的橢球以 attach 轉成各骨架的局部座標。
    cat.updateMatrixWorld(true);
    const colliders = regions.flatMap(([zone, bone, position, size]) => {
      const joint = cat.getObjectByName(bone);
      if (!joint) return [];
      const proxy = new Mesh(geometry, invisible);
      proxy.position.set(position[0], position[1], position[2]);
      proxy.scale.set(size[0], size[1], size[2]);
      proxy.visible = false;
      proxy.userData.zone = zone;
      proxy.updateMatrixWorld();
      joint.attach(proxy);
      return [proxy];
    });
    proxies.current = colliders;
    const idle = actions.idle;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced.current) idle?.reset().play();
    return () => {
      idle?.stop();
      colliders.forEach(proxy => proxy.removeFromParent());
      proxies.current = [];
      originals.forEach((material, mesh) => { mesh.material = material; });
      white.dispose();
      geometry.dispose();
      invisible.dispose();
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

  function zone(ray: Raycaster): PetZone {
    group.current?.updateWorldMatrix(true, true);
    return ray.intersectObjects(proxies.current, false)[0]?.object.userData.zone ?? null;
  }

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
      onStroke(zone(ray), distance, dt, true);
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
      <Canvas dpr={[1, 1.5]} camera={{ position: [0.98, 0.61, 0.55], fov: 38, near: 0.02, far: 12 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.24, -0.025)}
        fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <hemisphereLight intensity={2} color={0xffffff} groundColor={0xd8c0a0} />
        <directionalLight position={[1, 2, 3]} intensity={2} />
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
