"use client";
// 平面圖 → 3D 娃娃屋（#138，規格 docs/hq/05 §6）：讀圖完成的房間並排，無天花板，可旋轉縮放。
// 場景資料在 src/lib/hq/floorplans/scene.ts（純函式、可測）；家具換成模型庫的 glb（kit.ts，Tina 2026-11-03：
// 效果比照 Meow/meowho_3d_room），地板用同一套橡木貼圖。點地板或上方房名＝選那間房（選中的房間在房名按鈕標示）。
// 用 next/dynamic（ssr: false）載入；不改動 Gaussian Splat 用的 RoomViewer。
import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { FLOOR_TEXTURE, kitScale, kitUrl } from "@/lib/hq/floorplans/kit";
import { freeSpot, obstacles, stepCat, wanderSpot, type CatState } from "@/lib/hq/floorplans/catwalk";
import { focusScenes, houseScene, sceneBounds, type RoomScene, type SceneBox } from "@/lib/hq/floorplans/scene";
import type { BodyType } from "@/lib/hq/cat-models/types";
import { CatModel } from "./CatPreview";
import type { PlanRoom } from "@/lib/hq/floorplans/types";

// 牆用 meowho_3d_room 的牆面漆色
const COLORS = { wall: "#EEE9E0", glass: "#BFD8E3" };
/** 面向鏡頭的牆降到這個高度（娃娃屋剖面），才看得到房間裡面 */
const CUT_M = 0.25;
const FOV = 38;

/**
 * 牆、門楣、窗台、玻璃：鏡頭在牆外側時（朝外方向和「牆→鏡頭」同向），牆降到 CUT_M、其餘先藏起來，
 * 轉到另一邊時自動恢復（比照 meowho_3d_room 的 open 版本，前面沒有牆擋住）。碰撞體不受影響。
 */
function WallPiece({ b }: { b: SceneBox }) {
  const ref = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m || !b.out) return;
    m.getWorldPosition(tmp);
    const dx = camera.position.x - tmp.x, dz = camera.position.z - tmp.z;
    const cut = (b.out[0] * dx + b.out[1] * dz) / (Math.hypot(dx, dz) || 1) > 0.2;
    if (b.kind === "wall") {
      const h = cut ? Math.min(CUT_M, b.sy) : b.sy;
      m.scale.y = h / b.sy;
      m.position.y = h / 2;
    } else m.visible = !cut;
  });
  const glass = b.kind === "glass";
  return (
    <mesh ref={ref} position={[b.x, b.y, b.z]} rotation={[0, b.rotY, 0]} castShadow={!glass} receiveShadow>
      <boxGeometry args={[b.sx, b.sy, b.sz]} />
      <meshStandardMaterial color={glass ? COLORS.glass : COLORS.wall} transparent={glass} opacity={glass ? 0.35 : 1} roughness={glass ? 0.1 : 0.9} />
    </mesh>
  );
}

function Block({ b, color }: { b: SceneBox; color: string }) {
  const glass = b.kind === "glass";
  return (
    <mesh position={[b.x, b.y, b.z]} rotation={[0, b.rotY, 0]} castShadow={!glass} receiveShadow>
      <boxGeometry args={[b.sx, b.sy, b.sz]} />
      <meshStandardMaterial color={color} transparent={glass} opacity={glass ? 0.35 : 1} roughness={glass ? 0.1 : 0.9} />
    </mesh>
  );
}

/** 家具：模型庫的 glb，縮放成讀圖結果的寬、高、深；載入中先用方塊 */
function Furniture({ b }: { b: SceneBox }) {
  const { scene } = useGLTF(kitUrl(b.furniture ?? "other"));
  const model = useMemo(() => {
    const m = scene.clone(true);
    m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return m;
  }, [scene]);
  return (
    <primitive object={model} position={[b.x, 0, b.z]} rotation={[0, b.rotY, 0]}
      scale={kitScale(b.furniture ?? "other", { w: b.sx, h: b.sy, d: b.sz })} />
  );
}

/** 地板：橡木貼圖，每 1.2 公尺重複一次 */
/** onClick 帶點到的位置（這間房的座標，公尺）：虛擬體驗用來叫貓走過去 */
function Floor({ b, onClick }: { b: SceneBox; onClick: (x: number, z: number) => void }) {
  const [color, normal] = useTexture([FLOOR_TEXTURE.color, FLOOR_TEXTURE.normal]);
  const maps = useMemo(() => [color, normal].map(t => {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(b.sx / FLOOR_TEXTURE.tileM, b.sz / FLOOR_TEXTURE.tileM);
    c.anisotropy = 4;
    c.needsUpdate = true;
    return c;
  }), [color, normal, b.sx, b.sz]);
  maps[0].colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={[b.x, b.y, b.z]} receiveShadow onClick={e => {
      e.stopPropagation();
      const local = e.object.worldToLocal(e.point.clone());  // 地板方塊中心 → 房間座標
      onClick(local.x + b.x, local.z + b.z);
    }}>
      <boxGeometry args={[b.sx, b.sy, b.sz]} />
      <meshStandardMaterial map={maps[0]} normalMap={maps[1]} roughness={0.55} />
    </mesh>
  );
}

function Room({ s, onFloor, children }: { s: RoomScene; onFloor: (x: number, z: number) => void; children?: React.ReactNode }) {
  return (
    <group position={[s.offset[0], 0, s.offset[1]]}>
      {children}
      {s.boxes.map((b, i) =>
        b.kind === "floor" ? (
          <Suspense key={i} fallback={<Block b={b} color="#D9CCB4" />}><Floor b={b} onClick={onFloor} /></Suspense>
        ) : b.kind === "furniture" ? (
          <Suspense key={i} fallback={<Block b={b} color="#D8D2C8" />}><Furniture b={b} /></Suspense>
        ) : (
          <WallPiece key={i} b={b} />
        ))}
    </group>
  );
}

export interface ViewerCat { baseUrl: string; albedoUrl: string; body: BodyType }

/**
 * 虛擬體驗（#150）：貓在房間裡走。點地板＝目標；走路播 walk、停下播 idle；閒置 6 秒後自己找個空位逛過去。
 * 移動規則在 src/lib/hq/floorplans/catwalk.ts（純函式、可測）。
 */
function CatActor({ s, look, target }: { s: RoomScene; look: ViewerCat; target: { x: number; z: number; at: number } | null }) {
  const obs = useMemo(() => obstacles(s), [s]);
  const start = useMemo(() => freeSpot(s, obs) ?? { x: s.size[0] / 2, z: s.size[1] / 2 }, [s, obs]);
  const ref = useRef<THREE.Group>(null);
  const cat = useRef<CatState>({ ...start, heading: 0, moving: false });
  const goal = useRef<{ x: number; z: number } | null>(null);
  const idle = useRef(0);
  const [moving, setMoving] = useState(false);
  useEffect(() => { if (target) goal.current = { x: target.x, z: target.z }; }, [target]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const next = stepCat(cat.current, goal.current, s, obs, dt);
    if (next.moving) idle.current = 0;
    else {
      goal.current = null;
      idle.current += dt;
      if (idle.current > 6) { idle.current = 0; goal.current = wanderSpot(s, obs); }
    }
    cat.current = next;
    ref.current?.position.set(next.x, 0, next.z);
    ref.current?.rotation.set(0, next.heading, 0);
    if (next.moving !== moving) setMoving(next.moving);
  });
  return (
    <group ref={ref} position={[start.x, 0, start.z]}>
      <Suspense fallback={null}>
        <CatModel baseUrl={look.baseUrl} albedoUrl={look.albedoUrl} clip={moving ? "walk" : "idle"} follow={false} />
      </Suspense>
    </group>
  );
}

/** 鏡頭：從前上方斜看整戶中心（原點），距離依整戶外框算，讓所有房間完整入鏡 */
function cameraFor(width: number, depth: number, height: number, aspect: number) {
  const radius = Math.max(Math.hypot(width, depth, height) / 2, 1.5);
  const vfov = (FOV * Math.PI) / 180;
  const fit = Math.min(vfov, 2 * Math.atan(Math.tan(vfov / 2) * aspect));  // 窄畫面（手機）以水平視角為準
  const dist = (radius / Math.sin(fit / 2)) * 1.1;
  const dir = new THREE.Vector3(-0.42, 0.72, 0.62).normalize();  // 左前上方斜看（比照 meowho_3d_room 的 camera_open_wide）
  return { position: [dir.x * dist, dir.y * dist, dir.z * dist] as [number, number, number], dist };
}

/** 切換「全部／單間」時把鏡頭移回預設角度，並讓旋轉中心回到原點 */
function CameraRig({ position, view }: { position: [number, number, number]; view: string }) {
  const camera = useThree(st => st.camera);
  const controls = useThree(st => st.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(0, 0, 0);
    controls?.target.set(0, 0, 0);
    controls?.update();
    // 只在切換房間時重設；position 由 view 決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, camera, controls]);
  return null;
}

/**
 * 上方膠囊：「全部」＝讀圖完成的房間並排；點某間＝3D 只顯示那一間並重新取景，同時切換下方的原圖預覽（onPick）。
 */
export default function FloorplanViewer({ rooms, selected, onPick, cat }: {
  rooms: PlanRoom[]; selected: string | null; onPick: (id: string) => void;
  /** 虛擬體驗（#150）：放一隻貓進去；有貓時只顯示單間（沒有「全部」），點地板叫貓走過去 */
  cat?: ViewerCat | null;
}) {
  const scenes = useMemo(() => houseScene(rooms), [rooms]);
  const [focus, setFocus] = useState<string | null>(cat ? selected ?? scenes[0]?.id ?? null : null);
  const [target, setTarget] = useState<{ x: number; z: number; at: number } | null>(null);
  const shown = useMemo(() => focusScenes(scenes, focus), [scenes, focus]);
  const { width, depth, height } = sceneBounds(shown);
  const half = Math.max(width, depth) / 2 + 2;
  // 畫面寬高比：桌機約 2.5、手機約 1.1（hq.css 的 .hq-fp-3d）；取保守值讓兩邊都框得住
  const cam = cameraFor(width, depth, height, 1.6);
  const view = focus ?? "all";
  // 在下方房間清單切換時，單間模式跟著換到那一間（全部模式不動）
  useEffect(() => { setFocus(f => (f && selected && f !== selected ? selected : f)); }, [selected]);
  const pick = (id: string) => { setFocus(id); setTarget(null); onPick(id); };

  return (
    <div className="hq-fp-3dwrap">
      {/* 房名放在 3D 上方：浮在場景裡的標籤在 React 19 會掉，手機也不好點 */}
      <div className="hq-row hq-fp-3dnames" role="group" aria-label="選房間">
        {scenes.length > 1 && !cat && (
          <button type="button" className={`hq-fp-3dlabel${focus === null ? " on" : ""}`} aria-pressed={focus === null} onClick={() => setFocus(null)}>全部</button>
        )}
        {scenes.map(s => {
          const on = focus === s.id || (scenes.length === 1 && (s.id === selected || !!cat));
          return <button key={s.id} type="button" className={`hq-fp-3dlabel${on ? " on" : ""}`} aria-pressed={on} onClick={() => pick(s.id)}>{s.name}</button>;
        })}
      </div>
      <div className="hq-fp-3d">
        <Canvas shadows={{ type: THREE.PCFSoftShadowMap }} camera={{ position: cam.position, fov: FOV, near: 0.1, far: 500 }}>
          <color attach="background" args={["#F3EFE7"]} />
          <hemisphereLight args={["#fffaf2", "#d8ccb8", 1.7]} />
          <ambientLight intensity={0.35} />
          {/* 顯示的房間移到原點附近：平行光的目標是原點，陰影範圍才會罩住所有房間 */}
          <directionalLight position={[-4, 8, 5]} intensity={2.2} color="#fff6e8" castShadow
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
            shadow-camera-left={-half} shadow-camera-right={half} shadow-camera-top={half} shadow-camera-bottom={-half} />
          <group position={[-width / 2, 0, -depth / 2]}>
            {shown.map(s => (
              <Room key={s.id} s={s} onFloor={(x, z) => (cat ? setTarget({ x, z, at: Date.now() }) : pick(s.id))}>
                {cat && <CatActor key={`${s.id}:${cat.albedoUrl}`} s={s} look={cat} target={target} />}
              </Room>
            ))}
          </group>
          <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.1} minDistance={1.5} maxDistance={cam.dist * 2.5} makeDefault />
          <CameraRig position={cam.position} view={view} />
        </Canvas>
      </div>
    </div>
  );
}
