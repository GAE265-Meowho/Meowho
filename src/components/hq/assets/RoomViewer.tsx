"use client";
// 展示房間的 3D 檢視（#93）：讀 3D Gaussian Splatting 檔，從拍攝點出發，拖曳轉頭、WASD 走動。
// 檢視器碰 WebGL 和 Web Worker，這個元件要用 next/dynamic（ssr: false）載入。
import * as GS from "@mkkellogg/gaussian-splats-3d";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { HqSkeleton } from "@/components/hq/HqStates";
import {
  cameraForward, roomSplats, roomUnit, sortCameras,
  type RoomCamera, type RoomLayout, type RoomScene,
} from "@/lib/hq/rooms/demo";
import { createRoomWorld, type RoomWorld } from "@/lib/hq/rooms/world";

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

export default function RoomViewer({ base }: { base: string }) {
  const host = useRef<HTMLDivElement>(null);
  const goTo = useRef<(step: number) => void>(() => {});
  const world = useRef<RoomWorld | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spot, setSpot] = useState({ index: 0, total: 0 });
  const [actions, setActions] = useState({ cat: false, bed: false, cup: false });

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
      const first = view(cameras[0]);
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
      const controls = active.controls;
      controls.enableZoom = false;  // 滾輪改成前後走
      controls.minPolarAngle = 0.02;
      controls.maxPolarAngle = Math.PI - 0.02;
      controls.keys = { LEFT: "", UP: "", RIGHT: "", BOTTOM: "" };  // 內建 WASD 是平移

      let index = 0;
      let tween: { from: { pos: THREE.Vector3; look: THREE.Vector3 }; to: ReturnType<typeof view>; start: number } | null = null;
      const tweenTo = (to: ReturnType<typeof view>) => {
        tween = { from: { pos: active.camera.position.clone(), look: controls.target.clone() }, to, start: performance.now() };
      };
      goTo.current = step => {
        index = (index + step + cameras.length) % cameras.length;
        setSpot({ index, total: cameras.length });
        tweenTo(view(cameras[index]));
      };
      setSpot({ index: 0, total: cameras.length });
      setStatus("ready");

      // 貓和物理載入失敗時，房間照常可以看
      const roomWorld = await createRoomWorld({
        viewer: active, threeScene, scene, layout, cameras, catUrl: CAT_MODEL, unit, focus: tweenTo,
      }).catch(e => {
        console.error("貓咪互動載入失敗", e);
        return null;
      });
      if (cancelled) return;
      world.current = roomWorld;
      if (roomWorld) setActions({ cat: true, bed: roomWorld.hasBed, cup: roomWorld.hasCup });
      let downAt: [number, number] | null = null;
      el.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; }, { signal: abort.signal });
      el.addEventListener("pointerup", e => {
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
      el.addEventListener("wheel", e => {
        e.preventDefault();
        move(directions().fwd.multiplyScalar(-Math.sign(e.deltaY) * unit * 0.03));
      }, { passive: false, signal: abort.signal });

      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        roomWorld?.update(dt);
        if (tween) {
          const t = Math.min(1, (now - tween.start) / TWEEN_MS);
          active.camera.position.lerpVectors(tween.from.pos, tween.to.pos, t);
          controls.target.lerpVectors(tween.from.look, tween.to.look, t);
          active.forceRenderNextFrame();
          if (t === 1) tween = null;
        } else if (held.size) {
          const { up, fwd, right } = directions();
          const d = new THREE.Vector3();
          if (held.has("KeyW")) d.add(fwd);
          if (held.has("KeyS")) d.sub(fwd);
          if (held.has("KeyD")) d.add(right);
          if (held.has("KeyA")) d.sub(right);
          if (held.has("KeyE")) d.add(up);
          if (held.has("KeyQ")) d.sub(up);
          if (d.lengthSq()) {
            const fast = held.has("ShiftLeft") || held.has("ShiftRight");
            move(d.normalize().multiplyScalar(unit * WALK_SPEED * (fast ? RUN_FACTOR : 1) * dt));
          }
        }
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
      world.current = null;
      // dispose 會試著把容器從 body 移除，這裡的容器不在 body 底下
      viewer?.dispose().catch(() => {}).finally(() => stage.remove());
      if (!viewer) stage.remove();
    };
  }, [base]);

  if (status === "error") {
    return <div className="hq-state"><p>房間載入失敗，請稍後再試。</p></div>;
  }
  return (
    <section className="hq-roomviewer" aria-label="展示房間">
      <div ref={host} className="hq-roomviewer-host">
        {status === "loading" && <div className="hq-roomviewer-loading"><HqSkeleton rows={3} /></div>}
      </div>
      <div className="hq-roomviewer-bar">
        <button type="button" className="hq-btn ghost" onClick={() => goTo.current(-1)} disabled={status !== "ready"}>上一個拍攝點</button>
        <span>{status === "ready" ? `拍攝點 ${spot.index + 1}／${spot.total}` : "載入中"}</span>
        <button type="button" className="hq-btn ghost" onClick={() => goTo.current(1)} disabled={status !== "ready"}>下一個拍攝點</button>
      </div>
      <div className="hq-roomviewer-bar">
        <button type="button" className="hq-btn ghost" onClick={() => world.current?.callCat()} disabled={!actions.cat}>叫貓過來</button>
        <button type="button" className="hq-btn ghost" onClick={() => world.current?.jumpOnBed()} disabled={!actions.bed}>跳上床</button>
        <button type="button" className="hq-btn ghost" onClick={() => world.current?.pushCup()} disabled={!actions.cup}>推倒杯子</button>
        <button type="button" className="hq-btn ghost" onClick={() => world.current?.resetItems()} disabled={!actions.cup}>重置物品</button>
      </div>
      <p className="hq-hint">拖曳轉頭，WASD 走動，Q／E 下降上升，Shift 加速，滾輪前後走，點地板叫貓過去。</p>
    </section>
  );
}
