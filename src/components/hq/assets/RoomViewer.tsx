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
import { createRoomWorld, type RoomWorld } from "@/lib/hq/rooms/world";
import { placeScanItems, type SceneItem } from "@/lib/play/scene-items";
import { sceneCatCommand } from "@/lib/play/scene-cat";
import type { CatAction } from "@/lib/play/stage";

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
 * bubble：貓頭頂的小對話框（表情符號），跟著貓在畫面上移動
 * controls：false 時不顯示拍攝點與貓咪動作按鈕（虛擬飼養用；拖曳、WASD、點地板仍可用）
 * noCat：只看房間、不放貓（前台我的 3D 房間預覽；貓等進了領養任務才出現）
 * overlay：前台預覽版面：前／後／左／右／上五個固定視角疊在畫面上；電腦用 WASD 走、手機用左下角搖桿；
 *   第一次會跳教學；滾輪還給網頁捲動（觸控板不會誤走）；瀏覽器支援時有全螢幕按鈕
 */
export default function RoomViewer({ base, cat, items, controls = true, story, wand, bubble, bubbleInset = 0, lookKey, noCat = false, overlay = false }: {
  base: string; cat?: { baseUrl: string; albedoUrl: string } | null; items?: readonly SceneItem[]; controls?: boolean; noCat?: boolean; overlay?: boolean;
  story?: { action: CatAction | null; at: number } | null; wand?: RoomWand | null;
  /** 貓頭頂的小對話框（表情符號）；null＝不顯示 */
  bubble?: string | null;
  /** 畫面下方被劇情卡蓋住的比例（0～1）；對話框不會畫到那裡，貓在卡片後面時貼在卡片上緣 */
  bubbleInset?: number;
  /** 這個值一變，鏡頭就原地轉向貓（null／不變不轉） */
  lookKey?: string | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const goTo = useRef<(step: number) => void>(() => {});
  const goView = useRef<(name: RoomViewName) => void>(() => {});
  const stick = useRef({ x: 0, y: 0 });  // 手機搖桿：x 右、y 前，長度 0～1
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [help, setHelp] = useState(false);
  const [canFull] = useState(() => typeof document !== "undefined" && document.fullscreenEnabled);
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
  const bubbleText = useRef<string | null>(null);
  const insetRef = useRef(bubbleInset);
  insetRef.current = bubbleInset;
  useEffect(() => { bubbleText.current = bubble ?? null; if (bubbleEl.current) bubbleEl.current.textContent = bubble ?? ""; }, [bubble]);
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
      const [scene, layout, rawCameras] = await Promise.all([
        readJson<RoomScene>(`${root}scene.json`),
        readJson<RoomLayout>(`${root}scene.layout.json`),
        readJson<RoomCamera[]>(`${root}scene.cameras.json`),
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
      const views = roomViews(scene.room, floorOf(new THREE.Vector3(...cameras[0].position)), Math.sign(ve1.clone().cross(vup).dot(ve2)) || 1);
      const fixedView = (name: RoomViewName) => {
        const { pos: [x, y, z], dir: [dx, dy, dz] } = views[name];
        const pos = vorigin.clone().addScaledVector(ve1, x * layout.units_per_meter)
          .addScaledVector(vup, y * layout.units_per_meter).addScaledVector(ve2, z * layout.units_per_meter);
        const dir = ve1.clone().multiplyScalar(dx).addScaledVector(vup, dy).addScaledVector(ve2, dz).normalize();
        return { pos, look: pos.clone().addScaledVector(dir, unit * 0.01) };
      };
      const first = overlay ? fixedView("front") : view(cameras[index]);
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
      await viewer.addSplatScenes(
        roomSplats(base, scene).map(s => ({
          path: s.url, format: GS.SceneFormat.Splat, splatAlphaRemovalThreshold: ALPHA_THRESHOLD, position: s.position,
        })),
        false,
      );
      if (cancelled) return;
      viewer.start();
      const active = viewer;
      // 虛擬用品：和貓同一套地板座標（x 沿 e1、y 向上、z 沿 e2，單位＝每公尺 units_per_meter）
      const [fe1, fup, fe2, forigin] = (["e1", "up", "e2", "origin"] as const).map(k => new THREE.Vector3(...layout[k]));
      const itemFrame = new THREE.Group();
      itemFrame.matrixAutoUpdate = false;
      itemFrame.matrix.makeBasis(fe1, fup, fe2).setPosition(forigin);
      itemFrame.updateMatrixWorld(true);
      threeScene.add(itemFrame, new THREE.HemisphereLight(0xffffff, 0x808080, 1.6));
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

      let tween: { from: { pos: THREE.Vector3; look: THREE.Vector3 }; to: ReturnType<typeof view>; start: number } | null = null;
      const tweenTo = (to: ReturnType<typeof view>) => {
        tween = { from: { pos: active.camera.position.clone(), look: controls.target.clone() }, to, start: performance.now() };
      };
      orbit.current = controls as unknown as { enabled: boolean };
      goTo.current = step => {
        index = (index + step + cameras.length) % cameras.length;
        setSpot({ index, total: cameras.length });
        tweenTo(view(cameras[index]));
      };
      goView.current = name => { setViewName(name); tweenTo(fixedView(name)); };
      setSpot({ index, total: cameras.length });
      setStatus("ready");
      if (overlay && !seenHelp()) setHelp(true);

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
        if (overlay) return;  // 前台：觸控板兩指滑常誤觸，滾輪還給網頁捲動
        e.preventDefault();
        move(directions().fwd.multiplyScalar(-Math.sign(e.deltaY) * unit * 0.03));
      }, { passive: false, signal: abort.signal });

      const head = new THREE.Vector3();
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        roomWorld?.update(dt);
        const be = bubbleEl.current;
        if (be) {
          if (bubbleText.current && roomWorld?.catHead(head)) {
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
          const t = Math.min(1, (now - tween.start) / TWEEN_MS);
          active.camera.position.lerpVectors(tween.from.pos, tween.to.pos, t);
          controls.target.lerpVectors(tween.from.look, tween.to.look, t);
          active.forceRenderNextFrame();
          if (t === 1) tween = null;
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
    addEventListener("keydown", e => { if (!typing(e)) held.add(e.code); }, { signal: abort.signal });
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
      world.current = null;
      orbit.current = null;
      setWorldReady(false);
      itemStage.current = null;
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
      <div ref={host} className="hq-roomviewer-host">
        {status === "loading" && <div className="hq-roomviewer-loading"><HqSkeleton rows={3} /></div>}
        <div ref={bubbleEl} className="hq-roomviewer-bubble" aria-hidden="true" />
        {overlay && status === "ready" && <>
          <div className="hq-roomviewer-views" role="group" aria-label="切換視角">
            {VIEW_BUTTONS.map(([name, label]) => (
              <button key={name} type="button" aria-pressed={viewName === name} onClick={() => goView.current(name)}>{label}</button>
            ))}
          </div>
          <div className="hq-roomviewer-tools">
            <button type="button" aria-label="怎麼看" onClick={() => setHelp(true)}>?</button>
            {canFull && <button type="button" aria-label="全螢幕" onClick={() => toggleFull(host.current)}>⛶</button>}
          </div>
          {touch && <Stick onMove={v => { stick.current = v; }} />}
          {help && <ViewerHelp touch={touch} onClose={() => { setHelp(false); markHelp(); }} />}
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

const HELP_KEY = "meowho.roomHelp";
const seenHelp = () => { try { return localStorage.getItem(HELP_KEY) === "1"; } catch { return false; } };
const markHelp = () => { try { localStorage.setItem(HELP_KEY, "1"); } catch { /* 無痕模式存不了，下次再顯示 */ } };

/** 全螢幕切換；手機順便鎖橫向（Android Chrome 支援，iPhone 沒有網頁全螢幕，按鈕不會出現） */
function toggleFull(el: HTMLElement | null) {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  el?.requestFullscreen().then(() => {
    (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape").catch(() => {});
  }).catch(() => {});
}

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
    ? [["👆", "單指拖曳畫面：轉頭看四周"], ["🕹️", "左下角搖桿：往上推前進、往下後退、左右橫移"], ["🧭", "上方「前／後／左／右／上」：換到固定視角"], ["📱", "手機轉橫看得更大"]]
    : [["🖱️", "拖曳畫面：轉頭看四周"], ["⌨️", "W／S 前進後退，A／D 左右橫移，Q／E 下降上升，按住 Shift 加速"], ["🧭", "上方「前／後／左／右／上」：換到固定視角"]];
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
