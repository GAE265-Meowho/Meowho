import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Color, Mesh, MeshStandardMaterial, Plane, Quaternion, Vector3, type Group, type Raycaster } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { brushDifficulty, brushPointers, brushScore, brushStep, brushStruggling, newBrush, type BrushResult, type BrushState } from "@/lib/play/mini3d/brush-rules";
import type { MiniCtx } from "../catgame/minis";
import { useScenePointer } from "./useScenePointer";
import styles from "./mini3d.module.css";

const instructions = {
  touch: ["碰嘴角", "按住嘴角標記，練習讓貓咪習慣被碰。"],
  lift: ["翻開嘴角", "按住嘴角標記並往上拖，保持牙齒露出。"],
  paste: ["嚐嚐牙膏", "把沾了牙膏的指套移到鼻子前，停住讓貓咪舔。"],
  finger: ["指套刷牙", "一指按住嘴角標記往上拖，另一指在前排牙齒上來回刷。電腦可按住空白鍵，再用滑鼠拖曳。"],
  brush: ["牙刷刷牙", "一指按住嘴角標記往上拖，另一指在六顆牙齒上來回刷。電腦可按住空白鍵，再用滑鼠拖曳。"],
} as const;

const model = "/hq-cat-models/base/base_clips.glb";
const plane = new Plane(new Vector3(0, 0, 1), -0.395);
const teethX = [-0.161, -0.096, -0.034, 0.034, 0.096, 0.161];
const dirty = new Color(0xc99d49);
const clean = new Color(0xfff9e9);

function Oval({ position, size, color }: {
  position: [number, number, number];
  size: [number, number, number];
  color: number;
}) {
  return <mesh position={position} scale={size}>
    <sphereGeometry args={[1, 24, 16]} />
    <meshStandardMaterial color={color} roughness={0.7} />
  </mesh>;
}

type Config = ReturnType<typeof brushDifficulty>;
function BrushScene({ config, onState }: { config: Config; onState: (state: BrushState) => void }) {
  const state = useRef(newBrush(config));
  const pointers = useRef({ lip: null, tool: null } as Parameters<typeof brushPointers>[0]);
  const face = useRef<Group>(null);
  const { scene } = useGLTF(model);
  const cat = useMemo(() => clone(scene), [scene]);
  const jaw = useMemo(() => {
    cat.updateMatrixWorld(true);
    const bone = cat.getObjectByName("jaw");
    if (!bone?.parent) throw new Error("Missing cat jaw");
    const axis = new Vector3(1, 0, 0)
      .applyQuaternion(bone.parent.getWorldQuaternion(new Quaternion()).invert());
    return {
      bone,
      closed: bone.quaternion.clone(),
      open: bone.quaternion.clone().premultiply(new Quaternion().setFromAxisAngle(axis, 0.42)),
    };
  }, [cat]);
  const mouth = useRef<Group>(null);
  const tool = useRef<Group>(null);
  const lip = useRef<Mesh>(null);
  const teeth = useRef<(Mesh | null)[]>([]);
  const startY = useRef(0);
  const lifted = useRef(false);
  const keyboard = useRef(false);
  const started = useRef(false);
  const locked = useRef(false);
  const wasStruggling = useRef(false);
  const target = useRef<number | null>(null);
  const travel = useRef(0);
  const near = useRef(false);
  const lastPoint = useRef<Vector3 | null>(null);
  const point = useMemo(() => new Vector3(), []);
  const practice = config.phase === "touch" || config.phase === "lift";
  const paste = config.phase === "paste";
  const reduced = useRef(false);
  const reportElapsed = useRef(0);

  useEffect(() => {
    const mesh = cat.getObjectByName("cat_base");
    if (!(mesh instanceof Mesh)) throw new Error("Missing cat skin");
    const fur = new MeshStandardMaterial({ color: 0xeae4db, roughness: 0.86 });
    const original = mesh.material;
    mesh.material = fur;
    const morphs = mesh.morphTargetInfluences;
    const blink = morphs?.slice();
    morphs?.fill(0);
    return () => {
      mesh.material = original;
      if (morphs && blink) blink.forEach((value, index) => { morphs[index] = value; });
      fur.dispose();
    };
  }, [cat]);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || paste || (event.target instanceof HTMLElement && event.target.closest("button"))) return;
      event.preventDefault();
      keyboard.current = true;
      started.current = true;
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        keyboard.current = false;
        if (!lifted.current) locked.current = false;
      }
    };
    const reset = () => {
      keyboard.current = false;
      locked.current = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", reset);
    };
  }, [paste]);

  function trackTool(ray: Raycaster) {
    if (!ray.ray.intersectPlane(plane, point)) return;
    const previous = lastPoint.current;
    const distance = previous?.distanceTo(point) ?? 0;
    lastPoint.current = point.clone();
    if (tool.current) {
      tool.current.visible = true;
      tool.current.position.copy(point);
      tool.current.position.x = Math.max(-1, Math.min(1, point.x));
      tool.current.position.y = Math.max(-0.65, Math.min(0.75, point.y));
    }
    near.current = paste && Math.hypot(point.x, point.y - 0.175) < 0.18;
    face.current?.updateWorldMatrix(true, true);
    const hits = ray.intersectObjects(teeth.current.filter((mesh): mesh is Mesh => mesh !== null && mesh.visible));
    const next = hits[0]?.object.userData.target ?? null;
    if (paste || (next !== null && next === target.current)) travel.current += distance;
    target.current = next;
  }

  useScenePointer({
    down(event, ray) {
      if (state.current.result) return;
      started.current = true;
      const hitLip = !paste && lip.current && ray.intersectObject(lip.current).length > 0;
      const role = hitLip && !keyboard.current ? "lip" : practice ? null : "tool";
      if (!role) return;
      const next = brushPointers(pointers.current, event.pointerId, role);
      if (next === pointers.current) return;
      pointers.current = next;
      if (role === "lip") {
        startY.current = event.clientY;
        lifted.current = config.phase === "touch";
      } else trackTool(ray);
    },
    move(event, ray) {
      if (pointers.current.lip === event.pointerId && startY.current - event.clientY >= 12) lifted.current = true;
      if (pointers.current.tool === event.pointerId) trackTool(ray);
    },
    release(event) {
      if (pointers.current.lip === event.pointerId) {
        lifted.current = false;
        if (!keyboard.current) locked.current = false;
      }
      if (pointers.current.tool === event.pointerId) {
        target.current = null;
        near.current = false;
        lastPoint.current = null;
        travel.current = 0;
        if (tool.current) tool.current.visible = false;
      }
      pointers.current = brushPointers(pointers.current, event.pointerId, "release");
    },
    reset() {
      pointers.current = { lip: null, tool: null };
      lifted.current = false;
      near.current = false;
      lastPoint.current = null;
      target.current = null;
      travel.current = 0;
      if (tool.current) tool.current.visible = false;
    },
  });

  useFrame((_, dt) => {
    if (!started.current || state.current.result) return;
    const holding = keyboard.current || lifted.current;
    const next = brushStep(state.current, config, {
      dt, holding: holding && (!locked.current || wasStruggling.current),
      target: target.current, travel: travel.current, near: practice || near.current,
    });
    state.current = next;
    travel.current = 0;
    const struggle = brushStruggling(next.elapsed, config);
    if (struggle && holding) locked.current = true;
    const open = holding && !locked.current && !struggle && config.phase !== "touch" && !next.result;
    if (face.current) face.current.rotation.z = struggle && !reduced.current ? Math.sin(next.elapsed * 30) * 0.085 : 0;
    jaw.bone.quaternion.copy(open ? jaw.open : jaw.closed);
    if (mouth.current) mouth.current.visible = open;
    teeth.current.forEach((mesh, index) => {
      if (!mesh) return;
      mesh.visible = open;
      const value = next.clean[index] ?? 0;
      const material = mesh.material;
      if ("color" in material && material.color instanceof Color) material.color.copy(dirty).lerp(clean, value);
    });
    reportElapsed.current += dt;
    if (reportElapsed.current >= 0.08 || next.result || wasStruggling.current !== struggle) {
      reportElapsed.current = 0;
      onState(next);
    }
    wasStruggling.current = struggle;
  });

  return <>
    <group ref={face}>
      <group position={[-0.19, -3.5, -2]} scale={10}>
        <primitive object={cat} dispose={null} />
      </group>
      <group ref={mouth} visible={false}>
        <Oval position={[0, -0.185, 0.312]} size={[0.209, 0.091, 0.065]} color={0x42282a} />
        <Oval position={[0, -0.138, 0.347]} size={[0.181, 0.028, 0.034]} color={0xa96062} />
      </group>
      {(config.teeth === 4 ? teethX.slice(1, -1) : teethX).map((x, index) => (
        <mesh key={x} ref={node => { teeth.current[index] = node; }} position={[x, -0.173, 0.368 - Math.abs(x) * 0.18]} scale={[0.025, Math.abs(x) > 0.14 ? 0.05 : 0.032, 0.019]} userData={{ target: index }} visible={false}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color={config.teeth ? dirty : clean} />
        </mesh>
      ))}
      {!paste && <group position={[0.219, -0.112, 0.31]}>
        <mesh ref={lip} visible={false}>
          <sphereGeometry args={[0.093, 12, 8]} />
          <meshBasicMaterial />
        </mesh>
        <mesh renderOrder={1}>
          <ringGeometry args={[0.024, 0.033, 24]} />
          <meshBasicMaterial color={0xb25a39} depthTest={false} />
        </mesh>
      </group>}
    </group>
    <group ref={tool} visible={false}>
      <group rotation={[0, 0, -0.48]}>
        <Oval position={[0, 0, 0.017]} size={[0.051, 0.035, 0.028]} color={0xe2f2ed} />
        <Oval position={[0.175, 0, 0.022]} size={[config.phase === "brush" ? 0.17 : 0.09, 0.022, 0.025]} color={0x409487} />
      </group>
    </group>
  </>;
}

export function BrushGame3D({ ctx, onDone }: { ctx: MiniCtx; onDone: (r: BrushResult) => void }) {
  const [config] = useState(() => brushDifficulty(ctx.cat.trust, ctx.cat.stress, ctx.brushLevel ?? 0));
  const [state, setState] = useState(() => newBrush(config));
  const [label, hint] = instructions[config.phase];
  const score = brushScore(state);
  const struggling = brushStruggling(state.elapsed, config);
  const outcome = state.result?.bitten ? "貓咪咬人了" : state.result?.ran ? "貓咪跑走了" : state.result ? "練習完成" : struggling ? "貓咪在搖頭，請放手再試" : "";
  return <>
    <p className={styles.hint}><strong>{label}：</strong>{hint}</p>
    <div className={styles.scene}>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.41, 2.85], fov: 34 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.41, 0)}
        fallback={<p role="alert">這個瀏覽器無法顯示 3D 場景。</p>}>
        <hemisphereLight intensity={2} color={0xffffff} groundColor={0xd8c0a0} />
        <directionalLight position={[2, 3, 4]} intensity={2} />
        <Suspense fallback={null}><BrushScene config={config} onState={setState} /></Suspense>
      </Canvas>
    </div>
    <div className={styles.meters}>
      <label>進度 <progress max={100} value={score} /> {score}%</label>
      <label>耐心 <progress max={config.patience} value={Math.max(0, config.patience - state.elapsed)} /></label>
    </div>
    <p className={styles.status} role="status">{outcome}</p>
    {state.result && <button className="btn" type="button" onClick={() => state.result && onDone(state.result)}>確認結果</button>}
  </>;
}
