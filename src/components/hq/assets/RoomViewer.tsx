"use client";
// 展示房間的 3D 檢視（#93）：讀 3D Gaussian Splatting 檔，從拍攝點出發，拖曳轉頭、WASD 走動。
// 檢視器碰 WebGL 和 Web Worker，這個元件要用 next/dynamic（ssr: false）載入。
import * as GS from "@mkkellogg/gaussian-splats-3d";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HqSkeleton } from "@/components/hq/HqStates";
import {
  cameraForward, clampInRoom, roomSplats, roomUnit, roomViews, sortCameras,
  type RoomCamera, type RoomLayout, type RoomScene, type RoomViewName,
} from "@/lib/hq/rooms/demo";
import { OVERVIEW, dragOverview, holdFromKeys, overviewCamera, overviewStart, stepOverview, type OverviewHold } from "@/lib/hq/rooms/overview";
import { createRoomWorld, type RoomWorld } from "@/lib/hq/rooms/world";
import { isPrivateRoomBase, keepRecentRoom, roomFile } from "@/lib/home-room-cache";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { placeScanItems, type SceneItem } from "@/lib/play/scene-items";
import { sceneCatCommand } from "@/lib/play/scene-cat";
import type { CatAction } from "@/lib/play/stage";
import type { SceneLight } from "@/lib/play/scene-light";
import { TINT_UNIFORM, tintFragment } from "@/lib/hq/rooms/splat-tint";

const ALPHA_THRESHOLD = 5;  // 丟掉幾乎透明的高斯，手機比較順
const WALK_SPEED = 0.15;    // 每秒走幾個房間單位
const RUN_FACTOR = 3;
const TWEEN_MS = 700;
const CAT_MODEL = "/hq-cat-models/base/base_clips.glb";  // 全站共用的成貓母體

async function readJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

const gltf = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();

/** 把一個用品（GLB）放成「底部中心在原點、尺寸剛好是公尺 w × h × d」的物件；載入失敗畫同尺寸方塊 */
async function itemObject(it: SceneItem): Promise<THREE.Object3D> {
  const box = new THREE.Group();
  try {
    if (!modelCache.has(it.url)) modelCache.set(it.url, gltf.loadAsync(it.url).then(g => g.scene));
    const model = (await modelCache.get(it.url)!).clone(true);
    const b = new THREE.Box3().setFromObject(model);
    const size = b.getSize(new THREE.Vector3());
    if (!(size.x > 0 && size.y > 0 && size.z > 0)) throw new Error("empty model");
    model.scale.set(it.widthM / size.x, it.heightM / size.y, it.depthM / size.z);
    const nb = new THREE.Box3().setFromObject(model);
    model.position.set(-(nb.min.x + nb.max.x) / 2, -nb.min.y, -(nb.min.z + nb.max.z) / 2);
    box.add(model);
  } catch {
    modelCache.delete(it.url);
    const m = new THREE.Mesh(new THREE.BoxGeometry(it.widthM, it.heightM, it.depthM), new THREE.MeshStandardMaterial({ color: 0xc9a27a }));
    m.position.y = it.heightM / 2;
    box.add(m);
  }
  return box;
}

interface ItemStage { scene: RoomScene; layout: RoomLayout; viewer: GS.Viewer; frame: THREE.Group; toyFrame: THREE.Group }

const TOY_SHOW = 6;  // 逗貓玩具在畫面上放大幾倍（真實的老鼠只有 5 公分，看不到）

export interface RoomWand { toy: SceneItem; onCatch: (caught: boolean) => void }

/**
 * cat：虛擬體驗選的貓（母體＋貼圖）；不給就用成貓母體預設花色
 * items：要擺進房間的虛擬用品（外出籠、餐碗、貓砂盆），位置由 placeScanItems 算在地板上，換了清單會即時更新
 * story：虛擬飼養的貓配合劇情（action＝null 躲起來、carrier 走到外出籠、sleep 跳上床…），換了（at 不同）就執行
 * wand：3D 逗貓。給了就停用拖曳轉頭，玩具跟著滑鼠／手指在地板上移動，貓追著撲；每次撲完呼叫 onCatch(是否抓到)
 * bubble：貓頭頂的小對話框（SVG 圖示），跟著貓在畫面上移動
 * controls：false 時不顯示拍攝點與貓咪動作按鈕（虛擬飼養用；拖曳、WASD、點地板仍可用）
 * noCat：只看房間、不放貓（前台我的 3D 房間預覽；貓等進了領養任務才出現）
 * overlay：前台預覽版面：前／後／左／右／上五個固定視角疊在畫面上；電腦用 WASD 走、手機用左下角搖桿；
 *   每次開場先跳操作說明，按掉後縮成右下角的按鈕；滾輪還給網頁捲動（觸控板不會誤走）；右下角有全螢幕按鈕
 * overview：俯視鏡頭（虛擬飼養「擺用品」用，#354）。給了（物件）就從高處往下看整個房間，只能繞房間中心轉、調俯仰角：
 *   手指拖曳，或由外面的方向鍵傳入按住的方向（x 右 1 左 −1、y 上 1 下 −1）；不能走動、不能縮放。
 *   null／不給＝原本的鏡頭（預設）；從有變成沒有時鏡頭直接回到原本的開場位置。角度與限制都在 lib/hq/rooms/overview.ts 的 OVERVIEW
 * light：虛擬飼養的白天／夜晚光（#354，lib/play/scene-light.ts 的 lightFor(time).scan）。高斯點不吃燈光，所以
 *   Splat 材質的片段著色器最後乘上 uTint（lib/hq/rooms/splat-tint.ts；只編譯一次，之後換日夜只改 uniform 值），
 *   虛擬物件的半球光調暗調藍，貓身上多一盞小補光；不加後製、不多渲染一次。
 *   null／不給＝不改著色器、原本的燈光（預設，MeowHQ 照舊）
 */
export default function RoomViewer({ base, cat, items, controls = true, story, wand, bubble, bubbleInset = 0, lookKey, noCat = false, overlay = false, overview = null, light = null }: {
  base: string; cat?: { baseUrl: string; albedoUrl: string } | null; items?: readonly SceneItem[]; controls?: boolean; noCat?: boolean; overlay?: boolean;
  story?: { action: CatAction | null; at: number } | null; wand?: RoomWand | null;
  /** 貓頭頂的小對話框（SVG 圖示）；null＝不顯示 */
  bubble?: React.ReactNode;
  /** 畫面下方被劇情卡蓋住的比例（0～1）；對話框不會畫到那裡，貓在卡片後面時貼在卡片上緣 */
  bubbleInset?: number;
  /** 這個值一變，鏡頭就原地轉向貓（null／不變不轉） */
  lookKey?: string | null;
  overview?: OverviewHold | null;
  light?: SceneLight["scan"] | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const goTo = useRef<(step: number) => void>(() => {});
  const goView = useRef<(name: RoomViewName) => void>(() => {});
  const stick = useRef({ x: 0, y: 0 });  // 手機搖桿：x 右、y 前，長度 0～1
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [help, setHelp] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);  // 前台房間下載進度（%）；null＝不顯示
  // 全螢幕：先用 CSS 讓房間佔滿整個瀏覽器視窗（一定有反應，iPhone 也行），瀏覽器支援時再進真正的全螢幕
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement) setFull(false); };  // 按 Esc 離開真正全螢幕時一起還原
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [full]);
  const toggleFull = () => {
    if (full) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setFull(false); return; }
    setFull(true);
    host.current?.requestFullscreen?.().then(() => {
      (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape").catch(() => {});
    }).catch(() => {});  // 不支援或被擋：維持 CSS 版
  };
  const [viewName, setViewName] = useState<RoomViewName>("front");
  const world = useRef<RoomWorld | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spot, setSpot] = useState({ index: 0, total: 0 });
  const [actions, setActions] = useState({ cat: false, bed: false, cup: false });
  const itemStage = useRef<ItemStage | null>(null);
  const [itemsReady, setItemsReady] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const orbit = useRef<{ enabled: boolean } | null>(null);
  const wandOn = useRef(false);
  const bubbleEl = useRef<HTMLDivElement>(null);
  const hasBubble = useRef(false);
  const insetRef = useRef(bubbleInset);
  insetRef.current = bubbleInset;
  useEffect(() => { hasBubble.current = Boolean(bubble); }, [bubble]);
  const overviewHold = useRef<OverviewHold | null>(overview);
  overviewHold.current = overview;
  const setOverview = useRef<(on: boolean) => void>(() => {});
  // 白天／夜晚光（#354）：半球光、貓的補光留著參照好換色；tint 是 Splat 著色器 uTint 的值（所有材質共用同一個向量）
  const hemi = useRef<THREE.HemisphereLight | null>(null);
  const glow = useRef<THREE.PointLight | null>(null);
  const tint = useRef(new THREE.Vector3(1, 1, 1));
  const lit = useRef(false);
  lit.current = Boolean(light);
  const onCatch = useRef<RoomWand["onCatch"] | null>(null);
  onCatch.current = wand?.onCatch ?? null;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let viewer: GS.Viewer | null = null;
    let frame = 0;
    const stage = document.createElement("div");
    stage.className = "hq-roomviewer-stage";
    el.append(stage);
    const held = new Set<string>();

    const load = async () => {
      const root = `${base.replace(/\/$/, "")}/`;
      // 前台私有房間：檔案存在瀏覽器（第二次打開不用再下載），並顯示下載進度
      const priv = isPrivateRoomBase(base);
      const userId = priv ? (await getBrowserSupabase()?.auth.getSession())?.data.session?.user.id ?? null : null;
      const showProgress = (loaded: number, total: number) => { if (total && !cancelled) setProgress(Math.min(99, Math.round((loaded / total) * 100))); };
      const get = (file: string, onProgress?: typeof showProgress) => roomFile(`${root}${file}`, userId, onProgress);
      const json = async <T,>(file: string): Promise<T> => (priv ? JSON.parse(await (await get(file)).text()) : readJson<T>(`${root}${file}`));
      // 房間主體最大，和設定檔同時開始下載；沒有 room_cut 的舊房間這個請求會失敗，之後改讀 scene.splat
      const CUT = "objects/room_cut.splat";
      if (priv) setProgress(0);
      const cut = priv ? get(CUT, showProgress).catch(() => null) : null;
      const [scene, layout, rawCameras] = await Promise.all([
        json<RoomScene>("scene.json"),
        json<RoomLayout>("scene.layout.json"),
        json<RoomCamera[]>("scene.cameras.json"),
      ]);
      if (cancelled) return;
      const cameras = sortCameras(rawCameras);
      const unit = roomUnit(cameras);
      const view = (c: RoomCamera) => {
        const pos = new THREE.Vector3(...c.position);
        // orbit 目標放在相機正前方極近處，拖曳就像原地轉頭
        return { pos, look: pos.clone().add(new THREE.Vector3(...cameraForward(c)).multiplyScalar(unit * 0.01)) };
      };
      // 影片開頭常貼著牆或家具、晃得最厲害，改從中段的拍攝點開場
      let index = Math.floor(cameras.length / 2);
      // 前台預覽：五個固定視角，從門口（前）開場
      const [ve1, vup, ve2, vorigin] = (["e1", "up", "e2", "origin"] as const).map(k => new THREE.Vector3(...layout[k]));
      const floorOf = (p: THREE.Vector3): [number, number, number] => {
        const d = p.clone().sub(vorigin).divideScalar(layout.units_per_meter);
        return [d.dot(ve1), d.dot(vup), d.dot(ve2)];
      };
      const handed = Math.sign(ve1.clone().cross(vup).dot(ve2)) || 1;
      const views = roomViews(scene.room, floorOf(new THREE.Vector3(...cameras[0].position)), handed);
      // 地板座標（公尺）的位置與方向 → 檢視器座標的鏡頭
      const floorView = ({ pos: [x, y, z], dir: [dx, dy, dz] }: { pos: number[]; dir: number[] }) => {
        const pos = vorigin.clone().addScaledVector(ve1, x * layout.units_per_meter)
          .addScaledVector(vup, y * layout.units_per_meter).addScaledVector(ve2, z * layout.units_per_meter);
        const dir = ve1.clone().multiplyScalar(dx).addScaledVector(vup, dy).addScaledVector(ve2, dz).normalize();
        return { pos, look: pos.clone().addScaledVector(dir, unit * 0.01) };
      };
      const fixedView = (name: RoomViewName) => floorView(views[name]);
      // 俯視鏡頭（擺用品）：角度只存在這裡，位置每次由 overviewCamera 算出來
      let angles = overviewStart(views.front.dir);
      let overviewOn = Boolean(overviewHold.current);
      const overviewView = () => floorView(overviewCamera(scene.room, angles.az, angles.tilt));
      const homeView = () => (overlay ? fixedView("front") : view(cameras[index]));
      const first = overviewOn ? overviewView() : homeView();
      const threeScene = new THREE.Scene();  // 貓畫在這，高斯點會依深度蓋在它前面
      const movable = scene.assets.room_cut && scene.objects.some(o => o.splat);
      viewer = new GS.Viewer({
        threeScene,
        rootElement: stage,
        cameraUp: layout.up,
        initialCameraPosition: first.pos.toArray(),
        initialCameraLookAt: first.look.toArray(),
        sharedMemoryForWorkers: false,  // 不需要 COOP/COEP 標頭
        sphericalHarmonicsDegree: 0,
        antialiased: !window.matchMedia("(pointer: coarse)").matches,  // 電腦上邊緣較平滑；手機省效能
        sceneRevealMode: GS.SceneRevealMode.Instant,  // 預設淡入在低階顯卡上要等很久
        dynamicScene: Boolean(movable),               // 杯子掉落時要每幀更新姿態
      });
      viewer.camera.near = unit * 0.002;  // 預設值會切掉近處牆面
      viewer.camera.updateProjectionMatrix();
      const blobUrls: string[] = [];
      const splatPath = async (url: string) => {
        if (!priv) return url;
        const file = url.slice(root.length);
        const blob = (file === CUT ? await cut : null) ?? await get(file, file === scene.assets.room ? showProgress : undefined);
        const u = URL.createObjectURL(blob);
        blobUrls.push(u);
        return u;
      };
      const splats = await Promise.all(roomSplats(base, scene).map(async s => ({ ...s, url: await splatPath(s.url) })));
      if (cancelled) { blobUrls.forEach(u => URL.revokeObjectURL(u)); return; }
      await viewer.addSplatScenes(
        splats.map(s => ({
          path: s.url, format: GS.SceneFormat.Splat, splatAlphaRemovalThreshold: ALPHA_THRESHOLD, position: s.position,
        })),
        false,
      );
      blobUrls.forEach(u => URL.revokeObjectURL(u));
      setProgress(null);
      if (userId) keepRecentRoom(userId, base.replace(/\/$/, "")).catch(() => {});
      if (cancelled) return;
      viewer.start();
      const active = viewer;
      // 虛擬用品：和貓同一套地板座標（x 沿 e1、y 向上、z 沿 e2，單位＝每公尺 units_per_meter）
      const [fe1, fup, fe2, forigin] = (["e1", "up", "e2", "origin"] as const).map(k => new THREE.Vector3(...layout[k]));
      const itemFrame = new THREE.Group();
      itemFrame.matrixAutoUpdate = false;
      itemFrame.matrix.makeBasis(fe1, fup, fe2).setPosition(forigin);
      itemFrame.updateMatrixWorld(true);
      hemi.current = new THREE.HemisphereLight(0xffffff, 0x808080, 1.6);
      threeScene.add(itemFrame, hemi.current);
      // 貓的補光：有 light 才加（一開始就加好，白天強度 0；換日夜時燈的數量不變，貓的材質不用重新編譯）
      if (lit.current) {
        glow.current = new THREE.PointLight(0xffe9c9, 0, layout.units_per_meter * 1.2, 1);
        threeScene.add(glow.current);
      }
      const toyFrame = new THREE.Group();
      toyFrame.matrixAutoUpdate = false;
      toyFrame.matrix.copy(itemFrame.matrix);
      toyFrame.updateMatrixWorld(true);
      threeScene.add(toyFrame);
      itemStage.current = { scene, layout, viewer: active, frame: itemFrame, toyFrame };
      setItemsReady(true);
      const controls = active.controls;
      controls.enableZoom = false;  // 滾輪改成前後走
      controls.minPolarAngle = 0.02;
      controls.maxPolarAngle = Math.PI - 0.02;
      controls.keys = { LEFT: "", UP: "", RIGHT: "", BOTTOM: "" };  // 內建 WASD 是平移

      let tween: { from: { pos: THREE.Vector3; look: THREE.Vector3 }; to: ReturnType<typeof view>; start: number; ms?: number } | null = null;
      const tweenTo = (to: ReturnType<typeof view>) => {
        tween = { from: { pos: active.camera.position.clone(), look: controls.target.clone() }, to, start: performance.now() };
      };
      orbit.current = controls as unknown as { enabled: boolean };
      const jumpTo = (to: ReturnType<typeof view>) => {
        tween = null;
        active.camera.position.copy(to.pos);
        controls.target.copy(to.look);
        active.forceRenderNextFrame();
      };
      if (overviewOn) orbit.current.enabled = false;  // 內建的拖曳轉頭、平移都關掉，改由下面的拖曳轉房間
      setOverview.current = on => {
        if (on === overviewOn) return;
        overviewOn = on;
        if (orbit.current) orbit.current.enabled = !on && !wandOn.current;
        if (on) {
          angles = overviewStart(views.front.dir);
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) jumpTo(overviewView());
          else tween = { from: { pos: active.camera.position.clone(), look: controls.target.clone() }, to: overviewView(), start: performance.now(), ms: OVERVIEW.flyMs };
        } else jumpTo(homeView());  // 直接回原本的開場位置：接下來的「轉向貓」是從鏡頭當下的位置算的，不能還在半空中
      };
      goTo.current = step => {
        index = (index + step + cameras.length) % cameras.length;
        setSpot({ index, total: cameras.length });
        tweenTo(view(cameras[index]));
      };
      goView.current = name => { setViewName(name); tweenTo(fixedView(name)); };
      setSpot({ index, total: cameras.length });
      setStatus("ready");
      if (overlay) setHelp(true);

      // 貓和物理載入失敗時，房間照常可以看
      const roomWorld = noCat ? null : await createRoomWorld({
        viewer: active, threeScene, scene, layout, cameras, catUrl: cat?.baseUrl ?? CAT_MODEL, albedoUrl: cat?.albedoUrl, unit, focus: tweenTo,
      }).catch(e => {
        console.error("貓咪互動載入失敗", e);
        return null;
      });
      if (cancelled) return;
      world.current = roomWorld;
      setWorldReady(Boolean(roomWorld));
      if (roomWorld) setActions({ cat: true, bed: roomWorld.hasBed, cup: roomWorld.hasCup });
      let downAt: [number, number] | null = null;
      el.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; }, { signal: abort.signal });
      // 俯視鏡頭：拖曳＝繞房間中心轉、調俯仰角（一次只認一根手指）
      let dragId: number | null = null, dragAt: [number, number] = [0, 0];
      el.addEventListener("pointerdown", e => { if (overviewOn && dragId === null) { dragId = e.pointerId; dragAt = [e.clientX, e.clientY]; } }, { signal: abort.signal });
      addEventListener("pointermove", e => {
        if (!overviewOn || e.pointerId !== dragId) return;
        angles = dragOverview(angles, e.clientX - dragAt[0], e.clientY - dragAt[1], handed);
        dragAt = [e.clientX, e.clientY];
        jumpTo(overviewView());
      }, { signal: abort.signal });
      for (const type of ["pointerup", "pointercancel"] as const) addEventListener(type, e => { if (e.pointerId === dragId) dragId = null; }, { signal: abort.signal });
      el.addEventListener("pointerup", e => {
        if (wandOn.current) return;  // 逗貓時玩具跟著手指，不用點地板叫貓
        if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;  // 拖曳是轉頭
        const r = el.getBoundingClientRect();
        roomWorld?.walkTo(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1));
      }, { signal: abort.signal });

      const directions = () => {
        const up = active.camera.up.clone().normalize();
        const fwd = controls.target.clone().sub(active.camera.position);
        fwd.addScaledVector(up, -fwd.dot(up)).normalize();  // 投影到水平面，走路不會飄上飄下
        return { up, fwd, right: fwd.clone().cross(up).normalize() };
      };
      const move = (delta: THREE.Vector3) => {
        active.camera.position.add(delta);
        controls.target.add(delta);
        active.forceRenderNextFrame();
      };
      // 走動、滾輪、右鍵平移都可能走出房間，每幀把鏡頭拉回牆內（看得到牆和地板背面就破功）
      const toFloor = (p: THREE.Vector3): [number, number, number] => {
        const d = p.clone().sub(forigin).divideScalar(layout.units_per_meter);
        return [d.dot(fe1), d.dot(fup), d.dot(fe2)];
      };
      const keepInRoom = () => {
        const [x, y, z] = clampInRoom(toFloor(active.camera.position), scene.room);
        const inside = forigin.clone().addScaledVector(fe1, x * layout.units_per_meter)
          .addScaledVector(fup, y * layout.units_per_meter).addScaledVector(fe2, z * layout.units_per_meter);
        if (inside.distanceToSquared(active.camera.position) > 1e-12) move(inside.sub(active.camera.position));
      };
      el.addEventListener("wheel", e => {
        if (overlay || overviewOn) return;  // 前台：觸控板兩指滑常誤觸，滾輪還給網頁捲動；俯視鏡頭不能前後走
        e.preventDefault();
        move(directions().fwd.multiplyScalar(-Math.sign(e.deltaY) * unit * 0.03));
      }, { passive: false, signal: abort.signal });

      const head = new THREE.Vector3();
      // Splat 整體調色：函式庫建（或重建）材質後補一次著色器（多一個 uniform 乘法，只編譯一次）；之後換日夜只改 tint 的值
      let tinted: object | null = null;
      const tintSplats = (v: GS.Viewer) => {
        const m = v.getSplatMesh()?.material;
        if (!m || m === tinted) return;
        tinted = m;
        m.uniforms[TINT_UNIFORM] = { value: tint.current };
        m.fragmentShader = tintFragment(m.fragmentShader);
        m.needsUpdate = true;
        v.forceRenderNextFrame();
      };
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        roomWorld?.update(dt);
        if (lit.current) tintSplats(active);
        // 補光放在貓頭和鏡頭之間（照亮貓朝鏡頭那一面）；白天強度 0 就不用算
        const g = glow.current;
        if (g && g.intensity > 0 && roomWorld?.catHead(head)) {
          g.position.copy(active.camera.position).sub(head).normalize().multiplyScalar(0.4 * layout.units_per_meter).add(head);
        }
        const be = bubbleEl.current;
        if (be) {
          if (hasBubble.current && roomWorld?.catHead(head)) {
            head.project(active.camera);
            // 貓在畫面外或鏡頭後面就不顯示（框只跟著貓，不貼邊）；框畫到被劇情卡蓋住的區域時往上推一點
            const onScreen = head.z < 1 && Math.abs(head.x) < 0.95 && head.y > -0.95 && head.y < 0.9;
            if (onScreen) {
              const minY = 1 - 2 * (1 - insetRef.current - 0.1);
              be.style.display = "block";
              be.dataset.edge = "false";
              be.style.left = `${(head.x * 0.5 + 0.5) * 100}%`; be.style.top = `${(-Math.max(head.y, minY) * 0.5 + 0.5) * 100}%`;
            } else be.style.display = "none";
          } else be.style.display = "none";
        }
        if (tween) {
          const t = Math.min(1, (now - tween.start) / (tween.ms ?? TWEEN_MS));
          active.camera.position.lerpVectors(tween.from.pos, tween.to.pos, t);
          controls.target.lerpVectors(tween.from.look, tween.to.look, t);
          active.forceRenderNextFrame();
          if (t === 1) tween = null;
        } else if (overviewOn) {
          // 按住方向鍵（畫面按鈕或鍵盤 ←↑→↓）連續轉，放開就停；俯視時不能用 WASD 走動
          const hold = holdFromKeys(held, overviewHold.current);
          if (hold.x || hold.y) {
            angles = stepOverview(angles, hold, dt, handed);
            jumpTo(overviewView());
          }
        } else if (held.size || stick.current.x || stick.current.y) {
          const { up, fwd, right } = directions();
          const d = new THREE.Vector3();
          // 搖桿推越遠走越快；和鍵盤同時用時合起來不超過全速
          d.addScaledVector(fwd, stick.current.y).addScaledVector(right, stick.current.x);
          if (held.has("KeyW")) d.add(fwd);
          if (held.has("KeyS")) d.sub(fwd);
          if (held.has("KeyD")) d.add(right);
          if (held.has("KeyA")) d.sub(right);
          if (held.has("KeyE")) d.add(up);
          if (held.has("KeyQ")) d.sub(up);
          if (d.lengthSq()) {
            const fast = held.has("ShiftLeft") || held.has("ShiftRight");
            if (held.size) d.normalize(); else d.clampLength(0, 1);
            move(d.multiplyScalar(unit * WALK_SPEED * (fast ? RUN_FACTOR : 1) * dt));
          }
        }
        if (!tween) keepInRoom();
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const abort = new AbortController();
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
    // 檢視器的內建控制在 window 攔截 WASD 和快捷鍵，在輸入框打字時要先擋下來，否則字打不出來
    addEventListener("keydown", e => { if (typing(e)) e.stopImmediatePropagation(); }, { capture: true, signal: abort.signal });
    addEventListener("keydown", e => {
      if (typing(e)) return;
      held.add(e.code);
      // 俯視鏡頭：焦點不在任何控制項上時，方向鍵是轉視角，不要捲動網頁
      if (overviewHold.current && e.code.startsWith("Arrow") && e.target === document.body) e.preventDefault();
    }, { signal: abort.signal });
    addEventListener("keyup", e => held.delete(e.code), { signal: abort.signal });
    addEventListener("blur", () => held.clear(), { signal: abort.signal });

    load().catch(e => {
      console.error("房間載入失敗", e);
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      abort.abort();
      cancelAnimationFrame(frame);
      goTo.current = () => {};
      goView.current = () => {};
      setOverview.current = () => {};
      world.current = null;
      orbit.current = null;
      setWorldReady(false);
      itemStage.current = null;
      hemi.current = null;
      glow.current = null;
      setItemsReady(false);
      // dispose 會試著把容器從 body 移除，這裡的容器不在 body 底下
      viewer?.dispose().catch(() => {}).finally(() => stage.remove());
      if (!viewer) stage.remove();
    };
  }, [base, cat?.baseUrl, cat?.albedoUrl, noCat, overlay]);

  // 虛擬用品清單變了就重擺（讀完房間後才做）
  useEffect(() => {
    const st = itemStage.current;
    if (!itemsReady || !st) return;
    let stale = false;
    const list = items ?? [];
    const spots = placeScanItems(st.scene, st.layout, list);
    // 貓不能穿過任何用品；只有劇情叫牠躲進外出籠（第 1 天）時，外出籠才讓牠進去
    const hideInCarrier = story?.action === "carrier";
    world.current?.setItems(list.flatMap((it, i) => (hideInCarrier && it.id === "carrier" ? [] : [{ x: spots[i].x, z: spots[i].z, widthM: it.widthM, depthM: it.depthM }])));
    Promise.all(list.map(itemObject)).then(objs => {
      if (stale || itemStage.current !== st) return;
      st.frame.clear();
      const upm = st.layout.units_per_meter;
      objs.forEach((o, i) => {
        const g = new THREE.Group();
        g.scale.setScalar(upm);
        g.position.set(spots[i].x * upm, 0, spots[i].z * upm);
        g.add(o);
        st.frame.add(g);
      });
      st.viewer.forceRenderNextFrame();
    });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, itemsReady, worldReady, story?.action, story?.at]);

  // 俯視鏡頭開關（要排在「鏡頭轉向貓」前面：離開俯視時先回到原本的位置，再轉向貓）
  const overviewWanted = Boolean(overview);
  useEffect(() => { if (status === "ready") setOverview.current(overviewWanted); }, [overviewWanted, status]);

  // 白天／夜晚：Splat 的 tint、虛擬物件的半球光、貓的補光跟著換（房間讀好後才有燈）；只改數值，不重新編譯
  const [tr, tg, tb] = light?.tint ?? [1, 1, 1];
  const hemiSky = light?.hemi.sky ?? 0xffffff, hemiGround = light?.hemi.ground ?? 0x808080, hemiPower = light?.hemi.intensity ?? 1.6;
  const glowPower = light?.catLight ?? 0, glowColor = light?.catLightColor ?? 0xffe9c9;
  useEffect(() => {
    tint.current.set(tr, tg, tb);
    const h = hemi.current;
    if (h) { h.color.setHex(hemiSky); h.groundColor.setHex(hemiGround); h.intensity = hemiPower; }
    const g = glow.current;
    if (g) { g.intensity = glowPower; g.color.setHex(glowColor); }
    itemStage.current?.viewer.forceRenderNextFrame();
  }, [tr, tg, tb, hemiSky, hemiGround, hemiPower, glowPower, glowColor, itemsReady]);

  // 鏡頭轉向貓：貓頭頂的對話框才看得到
  useEffect(() => { if (lookKey && worldReady) world.current?.lookAtCat(); }, [lookKey, worldReady]);

  // 劇情動作：貓躲起來、走到用品旁、跳上家具（逗貓時由玩具帶著貓跑，不套用）
  useEffect(() => {
    const st = itemStage.current;
    if (!worldReady || !story || wand || !st) return;
    const placed = placeScanItems(st.scene, st.layout, items ?? []);
    world.current?.command(sceneCatCommand(story.action, st.scene.objects, placed));
    // items 變了不用重走；只在劇情動作換了（story.at）或房間讀好、逗貓結束時執行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.at, story?.action, worldReady, itemsReady, wand]);

  // 3D 逗貓：玩具跟著指標在地板上移動，貓追著撲
  const wandUrl = wand?.toy.url ?? null;
  useEffect(() => {
    const st = itemStage.current, w = world.current, el = host.current;
    if (!wand || !worldReady || !itemsReady || !st || !w || !el) return;
    let stale = false;
    const toy = wand.toy;
    const upm = st.layout.units_per_meter;
    const group = new THREE.Group();
    group.scale.setScalar(upm);
    group.visible = false;
    st.toyFrame.add(group);
    itemObject({ ...toy, widthM: toy.widthM * TOY_SHOW, depthM: toy.depthM * TOY_SHOW, heightM: toy.heightM * TOY_SHOW }).then(o => { if (!stale) group.add(o); });
    wandOn.current = true;
    if (orbit.current) orbit.current.enabled = false;
    w.command({ kind: "roam" });  // 躲起來的貓也要出來玩
    w.play(caught => onCatch.current?.(caught));
    const [minX, minZ] = st.scene.room.min, [maxX, maxZ] = st.scene.room.max;
    const move = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      const r = el.getBoundingClientRect();
      const at = w.floorAt(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1));
      if (!at) return;
      const x = Math.min(maxX - 0.1, Math.max(minX + 0.1, at[0])), z = Math.min(maxZ - 0.1, Math.max(minZ + 0.1, at[1]));
      group.position.set(x * upm, 0, z * upm);
      group.visible = true;
      w.setToy([x, z]);
      st.viewer.forceRenderNextFrame();
    };
    // 檢視器的內建控制可能攔下事件，所以在 window 的捕獲階段接，再確認指標在房間畫面上
    addEventListener("pointermove", move, true);
    addEventListener("pointerdown", move, true);
    return () => {
      stale = true;
      wandOn.current = false;
      if (orbit.current) orbit.current.enabled = true;
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerdown", move, true);
      w.play(null);
      w.setToy(null);
      st.toyFrame.remove(group);
      st.viewer.forceRenderNextFrame();
    };
    // wand 物件每次渲染都是新的，只看玩具網址
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wandUrl, worldReady, itemsReady]);

  if (status === "error") {
    return <div className="hq-state"><p>房間載入失敗，請稍後再試。</p></div>;
  }
  return (
    <section className="hq-roomviewer" aria-label="展示房間">
      <div ref={host} className="hq-roomviewer-host" data-full={overlay && full ? "true" : undefined}>
        {status === "loading" && <div className="hq-roomviewer-loading">
          {progress === null ? <HqSkeleton rows={3} /> : (
            <div className="hq-roomviewer-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="房間載入中">
              <p>房間載入中 {progress}%</p>
              {/* 進度條用行內樣式，前台預覽和 /play 都能顯示 */}
              <div style={{ height: 8, borderRadius: 4, background: "rgb(0 0 0 / 0.1)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${progress}%`, background: "currentColor", transition: "width .2s" }} />
              </div>
              <small>第一次打開要下載整間房間，之後再看會快很多</small>
            </div>
          )}
        </div>}
        <div ref={bubbleEl} className="hq-roomviewer-bubble" aria-hidden="true">{bubble}</div>
        {overlay && status === "ready" && <>
          <div className="hq-roomviewer-views" role="group" aria-label="切換視角">
            {VIEW_BUTTONS.map(([name, label]) => (
              <button key={name} type="button" aria-pressed={viewName === name} onClick={() => goView.current(name)}>{label}</button>
            ))}
          </div>
          <div className="hq-roomviewer-tools">
            {!help && <button type="button" onClick={() => setHelp(true)}>？操作說明</button>}
            <button type="button" aria-pressed={full} onClick={toggleFull}>{full ? "✕ 縮小" : "⛶ 全螢幕"}</button>
          </div>
          {touch && <Stick onMove={v => { stick.current = v; }} />}
          {help && <ViewerHelp touch={touch} onClose={() => setHelp(false)} />}
        </>}
      </div>
      {controls && !overlay && (
        <>
        <div className="hq-roomviewer-bar">
          <button type="button" className="hq-btn ghost" onClick={() => goTo.current(-1)} disabled={status !== "ready"}>上一個拍攝點</button>
          <span>{status === "ready" ? `拍攝點 ${spot.index + 1}／${spot.total}` : "載入中"}</span>
          <button type="button" className="hq-btn ghost" onClick={() => goTo.current(1)} disabled={status !== "ready"}>下一個拍攝點</button>
        </div>
        {!noCat && <div className="hq-roomviewer-bar">
          <button type="button" className="hq-btn ghost" onClick={() => world.current?.callCat()} disabled={!actions.cat}>叫貓過來</button>
          <button type="button" className="hq-btn ghost" onClick={() => world.current?.jumpOnBed()} disabled={!actions.bed}>跳上床</button>
          <button type="button" className="hq-btn ghost" onClick={() => world.current?.pushCup()} disabled={!actions.cup}>推倒杯子</button>
          <button type="button" className="hq-btn ghost" onClick={() => world.current?.resetItems()} disabled={!actions.cup}>重置物品</button>
        </div>}
        <p className="hq-hint">拖曳轉頭，WASD 走動，Q／E 下降上升，Shift 加速，滾輪前後走{noCat ? "" : "，點地板叫貓過去"}。</p>
        </>
      )}
    </section>
  );
}

const VIEW_BUTTONS: [RoomViewName, string][] = [["front", "前"], ["back", "後"], ["left", "左"], ["right", "右"], ["top", "上"]];


/** 手機左下角的搖桿：往上推前進、往下後退、左右橫移，推越遠走越快 */
function Stick({ onMove }: { onMove: (v: { x: number; y: number }) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 44;  // 搖桿可移動半徑（px）
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(x, y);
    if (len > R) { x *= R / len; y *= R / len; }
    setKnob({ x, y });
    onMove({ x: x / R, y: -y / R });
  };
  const stop = () => { setKnob({ x: 0, y: 0 }); onMove({ x: 0, y: 0 }); };
  return (
    <div className="hq-roomviewer-stick" role="application" aria-label="搖桿：往上推前進，往下後退，左右橫移"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e); }}
      onPointerUp={stop} onPointerCancel={stop} onContextMenu={e => e.preventDefault()}>
      <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function ViewerHelp({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  const rows: [string, string][] = touch
    ? [["👆", "單指拖曳畫面：轉頭看四周"], ["🕹️", "左下角搖桿：往上推前進、往下後退、左右橫移"], ["🧭", "上方「前／後／左／右／上」：換到固定視角"], ["⛶", "右下角「全螢幕」看得更大；手機轉橫也可以"]]
    : [["🖱️", "拖曳畫面：轉頭看四周"], ["⌨️", "W／S 前進後退，A／D 左右橫移，Q／E 下降上升，按住 Shift 加速"], ["🧭", "上方「前／後／左／右／上」：換到固定視角"], ["⛶", "右下角「全螢幕」看得更大，按 Esc 離開"]];
  return (
    <div className="hq-roomviewer-help" role="dialog" aria-modal="false" aria-labelledby="room-help-title">
      <div>
        <h3 id="room-help-title">怎麼看你家的 3D 房間</h3>
        <ul>{rows.map(([icon, text]) => <li key={text}><span aria-hidden="true">{icon}</span>{text}</li>)}</ul>
        <button type="button" onClick={onClose}>知道了</button>
      </div>
    </div>
  );
}
