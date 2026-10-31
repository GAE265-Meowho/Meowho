"use client";
// 貓咪 3D 預覽（規格書 04 §2.4）：沿用 cat_studio 的 /eye?mode=clips&cat=<id> 做法。
//   - 載入共用母體 base_clips.glb（身體、骨架、眼球、全部動作）
//   - 材質 cat_fur 的 map 換成這隻貓的貼圖；cat_eye 換成自訂眼球 shader
//   - 動作用 AnimationMixer，切換時淡入淡出 0.4 秒
//   - 形狀鍵 blink_L／blink_R 控制眨眼；「看游標」時眼睛在眼窩內跟著滑鼠轉（最大 28°）
// 貓咪頁與（PR 2b）貼圖工作頁共用。這個元件要用 next/dynamic（ssr: false）載入。
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createCatEyeMaterial, setCatEyeParams } from "./catEye";

export const CROSSFADE_SECONDS = 0.4;
export const MAX_GAZE = THREE.MathUtils.degToRad(28);
// 比 cat_studio（相機 0.75,0.35,0.75、目標 0,0.18,0）拉遠、抬高：後台預覽框較寬扁，貓連頭約 0.5 m，原本會切到頭
export const DEFAULT_CAMERA: [number, number, number] = [0.95, 0.45, 0.95];
export const DEFAULT_TARGET: [number, number, number] = [0, 0.23, 0];

export interface PreviewInfo { clips: string[]; eyes: number; bones: number; morphs: string[] }

export interface CatPreviewProps {
  baseUrl: string;
  /** 這隻貓的貼圖；null＝顯示母體預設貼圖 */
  albedoUrl: string | null;
  clip: string | null;
  speed?: number;
  paused?: boolean;
  /** 眨眼拉桿 0–1（和動作內建的眨眼取較大值） */
  blink?: number;
  /** 瞳孔寬窄 0（細縫）–1（全圓） */
  pupil?: number;
  /** 環境亮度（曝光） */
  light?: number;
  follow?: boolean;
  onInfo?: (info: PreviewInfo) => void;
  onTextureError?: () => void;
}

type EyeMesh = THREE.Mesh & { userData: { restQuat: THREE.Quaternion } };

function Environment() {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

function CatModel({ baseUrl, albedoUrl, clip, speed = 1, paused = false, blink = 0, pupil = 0.25, follow = true, onInfo, onTextureError }: CatPreviewProps) {
  const gltf = useGLTF(baseUrl);
  const matL = useMemo(() => createCatEyeMaterial(), []);
  const matR = useMemo(() => createCatEyeMaterial(), []);
  const lookPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.6), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  // 每個預覽自己複製一份場景與材質，避免換貼圖時影響到快取裡共用的 glb
  const rig = useMemo(() => {
    const root = cloneSkinned(gltf.scene);
    const fur: THREE.MeshStandardMaterial[] = [];
    const eyes: EyeMesh[] = [];
    const morphs: THREE.Mesh[] = [];
    let bones = 0;
    root.traverse(o => {
      if ((o as THREE.Bone).isBone) bones++;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.morphTargetDictionary) morphs.push(mesh);
      const mat = mesh.material as THREE.Material;
      if (mat.name === "cat_fur") {
        const copy = (mat as THREE.MeshStandardMaterial).clone();
        mesh.material = copy;
        fur.push(copy);
      } else if (mat.name === "cat_eye") {
        mesh.material = mesh.name.endsWith("L") ? matL : matR;
        mesh.userData.restQuat = mesh.quaternion.clone();
        eyes.push(mesh as EyeMesh);
      }
    });
    const defaults = fur.map(m => m.map);
    return { root, fur, eyes, morphs, bones, defaults };
  }, [gltf, matL, matR]);

  const mixer = useMemo(() => new THREE.AnimationMixer(rig.root), [rig]);
  const actions = useMemo(() => Object.fromEntries(gltf.animations.map(c => [c.name, mixer.clipAction(c)])), [gltf, mixer]);
  const current = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    onInfo?.({
      clips: Object.keys(actions),
      eyes: rig.eyes.length,
      bones: rig.bones,
      morphs: rig.morphs.flatMap(m => Object.keys(m.morphTargetDictionary ?? {})),
    });
    // 只在載入完成時回報一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, actions]);

  // 動作切換：淡入淡出
  useEffect(() => {
    const next = clip ? actions[clip] : undefined;
    const prev = current.current;
    if (!next || next === prev) return;
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, CROSSFADE_SECONDS, false);
    current.current = next;
  }, [clip, actions]);

  // 換貼圖：flipY = false、sRGB；沒有貼圖時還原母體預設
  useEffect(() => {
    let alive = true;
    let tex: THREE.Texture | null = null;
    const apply = (map: THREE.Texture | null, isDefault: boolean) => {
      rig.fur.forEach((m, i) => { m.map = isDefault ? rig.defaults[i] : map; m.needsUpdate = true; });
    };
    if (!albedoUrl) { apply(null, true); return; }
    new THREE.TextureLoader().loadAsync(albedoUrl).then(t => {
      if (!alive) { t.dispose(); return; }
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      tex = t;
      apply(t, false);
    }).catch(() => { if (alive) { apply(null, true); onTextureError?.(); } });
    return () => { alive = false; tex?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albedoUrl, rig]);

  useEffect(() => { setCatEyeParams(matL, { pupil }); setCatEyeParams(matR, { pupil }); }, [matL, matR, pupil]);
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);

  useFrame((state, delta) => {
    mixer.timeScale = speed;
    if (!paused) mixer.update(delta);
    // 眨眼拉桿：和動作內建的眨眼取較大值
    if (blink > 0) {
      for (const m of rig.morphs) {
        for (const [name, i] of Object.entries(m.morphTargetDictionary ?? {})) {
          if (name.startsWith("blink") && m.morphTargetInfluences) m.morphTargetInfluences[i] = Math.max(m.morphTargetInfluences[i], blink);
        }
      }
    }
    // 看游標：眼球只能在眼窩裡轉一定角度
    let hit = false;
    if (follow) {
      state.raycaster.setFromCamera(state.pointer, state.camera);
      hit = state.raycaster.ray.intersectPlane(lookPlane, lookTarget) !== null;
    }
    for (const e of rig.eyes) {
      e.quaternion.copy(e.userData.restQuat);
      if (!hit) continue;
      e.lookAt(lookTarget);
      const full = e.quaternion.clone();
      const angle = e.userData.restQuat.angleTo(full);
      e.quaternion.copy(e.userData.restQuat).slerp(full, Math.min(1, MAX_GAZE / Math.max(angle, 1e-6)));
    }
  });

  return <primitive object={rig.root} />;
}

/** 載入失敗（找不到母體 glb 等）時顯示說明，不讓整頁壞掉 */
class PreviewBoundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Exposure({ light }: { light: number }) {
  const gl = useThree(s => s.gl);
  useEffect(() => { gl.toneMappingExposure = light; }, [gl, light]);
  return null;
}

export default function CatPreview(props: CatPreviewProps & { onError?: (e: Error) => void }) {
  const { light = 1, onError, ...rest } = props;
  return (
    <Canvas
      camera={{ position: DEFAULT_CAMERA, fov: 30, near: 0.01, far: 50 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={({ camera }) => camera.lookAt(...DEFAULT_TARGET)}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <Exposure light={light} />
      <Environment />
      <directionalLight position={[3, 4, 5]} intensity={1.5} />
      <PreviewBoundary onError={e => onError?.(e)}>
        <Suspense fallback={null}>
          <CatModel {...rest} />
        </Suspense>
      </PreviewBoundary>
      <OrbitControls target={DEFAULT_TARGET} enableDamping minDistance={0.3} maxDistance={3} />
    </Canvas>
  );
}
