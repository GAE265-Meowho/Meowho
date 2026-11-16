"use client";
// 貓咪 3D 預覽（規格書 04 §2.4）：沿用 cat_studio 的 /eye?mode=clips&cat=<id> 做法。
//   - 載入共用母體 base_clips.glb（身體、骨架、眼球、全部動作）
//   - 材質 cat_fur 的 map 換成這隻貓的貼圖；cat_eye 換成自訂眼球 shader
//   - 動作用 AnimationMixer，切換時淡入淡出 0.4 秒
//   - 形狀鍵 blink_L／blink_R 控制眨眼；「看游標」時眼睛在眼窩內跟著滑鼠轉（最大 28°）
// 貓咪頁與（PR 2b）製作glb工作區共用。這個元件要用 next/dynamic（ssr: false）載入。
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createCatEyeMaterial, setCatEyeParams, type EyeParams } from "./catEye";
import type { BodyType } from "@/lib/hq/cat-models/types";
import { FALLBACK_CLIP } from "@/lib/hq/cat-models/clips";
import { headDownPose, PROCEDURAL_CLIPS } from "@/lib/hq/floorplans/story";
import { nextIdle, type IdleStep } from "@/lib/cat-actions";
import { inPlaceClip, isJumpClip } from "@/lib/hq/rooms/jump-clips";

/** 程式版吃飯、喝水會壓的骨頭（成貓、幼貓骨架同名），由上而下 */
const EAT_BONES = ["neck0", "neck1", "head0"] as const;

export const CROSSFADE_SECONDS = 0.4;
export const MAX_GAZE = THREE.MathUtils.degToRad(28);
// 比 cat_studio（相機 0.75,0.35,0.75、目標 0,0.18,0）拉遠、抬高：後台預覽框較寬扁，貓連頭約 0.5 m，原本會切到頭
export const DEFAULT_CAMERA: [number, number, number] = [0.95, 0.45, 0.95];
export const DEFAULT_TARGET: [number, number, number] = [0, 0.23, 0];
/** 睡姿貼地：中心低於站姿，沿用站姿目標會把貓切到畫面下方 */
// 對齊 cat_base/stepC_clips.py 預覽：target≈(0,0.06,-0.02)、斜前相機
export const SLEEP_CAMERA: [number, number, number] = [1.05, 0.45, 0.7];
export const SLEEP_TARGET: [number, number, number] = [0, 0.08, 0];
/** 跳躍（#291）：最高離地約一個身高、B 還會往前撲約一個體長，鏡頭拉遠、目標提高，整段都在畫面內 */
export const JUMP_CAMERA: [number, number, number] = [1.3, 0.75, 1.3];
export const JUMP_TARGET: [number, number, number] = [0, 0.34, 0];
/** 跳躍 C（#293）：從櫃子往下跳，要看得到櫃面與落地點 */
export const DOWN_CAMERA: [number, number, number] = [1.9, 1.1, 1.9];
export const DOWN_TARGET: [number, number, number] = [0, 0.4, -0.16];
/** 跳躍 C 的櫃子（glTF 座標、公尺；貓面向 +Z）。和 Meow/cat_base_kitten/stepC_clips.py 的 DOWN_HEIGHT 0.32、
 *  起跳點（往後 0.13 m）一致：櫃面高 0.32、前緣在 z = -0.06，貓前腳站在櫃子邊 */
export const CABINET = { position: [0, 0.16, -0.26] as [number, number, number], size: [0.4, 0.32, 0.4] as [number, number, number], color: "#b08a64" };
/** 成貓跳躍 C（#295）：Meow/cat_base/stepC_clips.py 的 DOWN_HEIGHT 0.64、起跳點往後 0.26 m；
 *  成貓前腳掌比幼貓更前面，櫃子前緣放在 z = -0.07，貓前腳剛好站在櫃子邊 */
export const CABINET_ADULT = { position: [0, 0.32, -0.47] as [number, number, number], size: [0.7, 0.64, 0.8] as [number, number, number], color: "#b08a64" };
/** 這個動作要不要畫道具（目前只有跳躍 C 的櫃子） */
export function propFor(clip: string | null | undefined, body: BodyType) {
  if (clip !== "jump_c") return null;
  return body === "kitten" ? CABINET : CABINET_ADULT;
}
/** 實際要畫的道具（#298）：載入的 glb 真的有這個動作才畫；還沒載入、或舊檔沒有這個動作時不畫，
 *  否則貓播預設待機站在地上，會卡在櫃子裡 */
export function visibleProp(clip: string | null | undefined, body: BodyType, loadedClips: string[] | null) {
  return clip && loadedClips?.includes(clip) ? propFor(clip, body) : null;
}

/** 幼貓母體體長約 0.22 m（成貓約 0.45 m）：相機、目標照比例縮小，不然幼貓縮在畫面下方 */
const KITTEN_SCALE = 0.5;
export function framing(body: BodyType, clip?: string | null) {
  const s = body === "kitten" ? KITTEN_SCALE : 1;
  const scale = (v: [number, number, number]) => v.map(x => x * s) as [number, number, number];
  const sleep = clip === "sleep";
  const down = clip === "jump_c";
  const jump = clip?.startsWith("jump") ?? false;
  return {
    camera: scale(sleep ? SLEEP_CAMERA : down ? DOWN_CAMERA : jump ? JUMP_CAMERA : DEFAULT_CAMERA),
    target: scale(sleep ? SLEEP_TARGET : down ? DOWN_TARGET : jump ? JUMP_TARGET : DEFAULT_TARGET),
    minDistance: 0.3 * s,
    maxDistance: 3 * s,
  };
}

export interface PreviewInfo { clips: string[]; eyes: number; bones: number; morphs: string[] }

export interface CatPreviewProps {
  baseUrl: string;
  /** 母體體型：決定預設取景 */
  body?: BodyType;
  /** 這隻貓的貼圖；null＝顯示母體預設貼圖 */
  albedoUrl: string | null;
  clip: string | null;
  speed?: number;
  paused?: boolean;
  /** 眨眼拉桿 0–1（和動作內建的眨眼取較大值） */
  blink?: number;
  /** 瞳孔寬窄 0（細縫）–1（全圓） */
  pupil?: number;
  /** 其他眼球參數（虹膜大小、角膜、顏色…），兩眼共用；骨架測試台用 */
  eye?: Partial<EyeParams>;
  /** 右眼另外覆蓋的參數（異色瞳） */
  eyeRight?: Partial<EyeParams>;
  /** 環境亮度（曝光） */
  light?: number;
  follow?: boolean;
  /** 跳躍動作原地播（拿掉根骨頭位移，位移由場景程式算；虛擬飼養娃娃屋用） */
  inPlaceJumps?: boolean;
  onInfo?: (info: PreviewInfo) => void;
  onTextureError?: () => void;
}

type EyeMesh = THREE.Mesh & { userData: { restQuat: THREE.Quaternion } };

export function Environment() {
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

export function CatModel({ baseUrl, albedoUrl, clip, speed = 1, paused = false, blink = 0, pupil = 0.25, eye, eyeRight, follow = true, inPlaceJumps = false, onInfo, onTextureError }: CatPreviewProps) {
  const [textureReady, setTextureReady] = useState(false);
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
  const actions = useMemo(() => Object.fromEntries(gltf.animations.map(c =>
    [c.name, mixer.clipAction(inPlaceJumps && isJumpClip(c.name) ? inPlaceClip(c) : c)])), [gltf, mixer, inPlaceJumps]);
  const current = useRef<THREE.AnimationAction | null>(null);
  // 程式版吃飯／喝水（#297）：骨架 glb 還沒有這個動作時，播 idle 再把頭頸往下壓（story.ts 的 headDownPose）
  const procClip = clip && PROCEDURAL_CLIPS.has(clip) && !actions[clip] ? clip : null;
  const neck = useMemo(() => EAT_BONES.map(n => rig.root.getObjectByName(n)).filter((b): b is THREE.Object3D => !!b), [rig]);
  const eat = useRef({ w: 0, t: 0, clip: "eat", saved: null as THREE.Quaternion[] | null });

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
    const next = clip ? actions[clip] ?? (clip === "eat" || clip === "drink" || clip === "toilet" ? actions[FALLBACK_CLIP] : undefined) : undefined;
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
    setTextureReady(false);
    const apply = (map: THREE.Texture | null, isDefault: boolean) => {
      rig.fur.forEach((m, i) => { m.map = isDefault ? rig.defaults[i] : map; m.needsUpdate = true; });
    };
    if (!albedoUrl) { apply(null, true); setTextureReady(true); return; }
    new THREE.TextureLoader().loadAsync(albedoUrl).then(t => {
      if (!alive) { t.dispose(); return; }
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      tex = t;
      apply(t, false);
      setTextureReady(true);
    }).catch(() => { if (alive) { apply(null, true); setTextureReady(true); onTextureError?.(); } });
    return () => { alive = false; tex?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albedoUrl, rig]);

  // eye／eyeRight 每次 render 可能是新物件，用內容當依賴
  const eyeKey = JSON.stringify([eye ?? null, eyeRight ?? null]);
  useEffect(() => {
    setCatEyeParams(matL, { ...eye, pupil });
    setCatEyeParams(matR, { ...eye, ...eyeRight, pupil });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matL, matR, pupil, eyeKey]);
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  useFrame((state, delta) => {
    mixer.timeScale = speed;
    const e = eat.current;
    // 上一格加過的低頭先還原，避免沒有被動作控制的骨頭一直累加
    if (e.saved) neck.forEach((b, i) => b.quaternion.copy(e.saved![i]));
    if (!paused) mixer.update(delta);
    if (procClip) e.clip = procClip;
    e.w = Math.max(0, Math.min(1, e.w + (procClip ? 1 : -1) * delta * 2.5));
    e.t = procClip ? e.t + delta * speed : 0;
    if (e.w > 0 && neck.length) {
      e.saved = neck.map(b => b.quaternion.clone());
      const pose = headDownPose(e.clip, e.t, e.w);
      rig.root.updateMatrixWorld(true);
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.root.getWorldQuaternion(new THREE.Quaternion()));
      neck.forEach(b => {
        // 繞貓身體的左右軸轉（模型正面朝 +Z，正角度＝鼻子朝下）：換到骨頭自己的座標再乘上去
        const parent = b.parent!.getWorldQuaternion(new THREE.Quaternion());
        const turn = new THREE.Quaternion().setFromAxisAngle(axis, pose[b.name as keyof typeof pose] ?? 0);
        b.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent));
        b.updateMatrixWorld(true);
      });
    } else e.saved = null;
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

  return <primitive object={rig.root} visible={textureReady} />;
}

/** 載入失敗（找不到母體 glb 等）時顯示說明，不讓整頁壞掉 */
class PreviewBoundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** 貓站在原地自己隨機換動作（lib/cat-actions.ts 的 nextIdle）；載入完動作清單才開始 */
function AutoCat({ body, model, onInfo }: { body: BodyType; model: Omit<CatPreviewProps, "clip" | "onInfo">; onInfo?: (info: PreviewInfo) => void }) {
  const [clips, setClips] = useState<string[] | null>(null);
  const [step, setStep] = useState<IdleStep | null>(null);
  useEffect(() => {
    if (!clips) return;
    const now = step ?? nextIdle(Math.random, clips, null);
    if (!step) { setStep(now); return; }
    const t = setTimeout(() => setStep(nextIdle(Math.random, clips, now)), now.seconds * 1000);
    return () => clearTimeout(t);
  }, [clips, step]);
  return <CatModel {...model} body={body} clip={step?.clip ?? FALLBACK_CLIP} onInfo={info => { setClips(info.clips); onInfo?.(info); }} />;
}

function Exposure({ light }: { light: number }) {
  const gl = useThree(s => s.gl);
  useEffect(() => { gl.toneMappingExposure = light; }, [gl, light]);
  return null;
}

/** autoplay：貓咪頁用，沒有動作按鈕；貓站在原地自己隨機換動作（clip 不用給）。取景與縮放、轉視角和一般預覽相同 */
export default function CatPreview(props: CatPreviewProps & { onError?: (e: Error) => void; autoplay?: boolean }) {
  const { light = 1, onError, body = "adult", clip = null, autoplay = false, ...rest } = props;
  // autoplay 固定用站姿取景：動作一直換，跟著換鏡頭會一直跳
  const view = framing(body, autoplay ? null : clip);
  const [loadedClips, setLoadedClips] = useState<string[] | null>(null);
  const prop = visibleProp(clip, body, loadedClips);
  // clip 改變時重建 Canvas，才能套用 sleep／跳躍／站姿不同的預設取景
  return (
    <Canvas
      key={autoplay ? `${body}-auto` : `${body}-${clip ?? "none"}`}
      camera={{ position: view.camera, fov: 30, near: 0.01, far: 50 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={({ camera }) => camera.lookAt(...view.target)}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <Exposure light={light} />
      <Environment />
      <directionalLight position={[3, 4, 5]} intensity={1.5} />
      <PreviewBoundary onError={e => onError?.(e)}>
        <Suspense fallback={null}>
          {autoplay ? <AutoCat body={body} model={rest} onInfo={rest.onInfo} /> : <CatModel {...rest} body={body} clip={clip} onInfo={info => { setLoadedClips(info.clips); rest.onInfo?.(info); }} />}
          {!autoplay && prop && (
            <mesh position={prop.position}>
              <boxGeometry args={prop.size} />
              <meshStandardMaterial color={prop.color} roughness={0.8} />
            </mesh>
          )}
        </Suspense>
      </PreviewBoundary>
      <OrbitControls target={view.target} enableDamping minDistance={view.minDistance} maxDistance={view.maxDistance} />
    </Canvas>
  );
}
