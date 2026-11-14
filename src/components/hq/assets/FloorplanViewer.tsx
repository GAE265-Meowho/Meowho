"use client";
// 平面圖 → 3D 娃娃屋（#138，規格 docs/hq/05 §6）：讀圖完成的房間並排，無天花板，可旋轉縮放。
// 場景資料在 src/lib/hq/floorplans/scene.ts（純函式、可測）；家具換成模型庫的 glb（kit.ts，Tina 2026-11-03：
// 效果比照 Meow/meowho_3d_room），地板用同一套橡木貼圖。點地板或上方房名＝選那間房（選中的房間在房名按鈕標示）。
// 用 next/dynamic（ssr: false）載入；不改動 Gaussian Splat 用的 RoomViewer。
import { Html, OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import { FLOOR_TEXTURE, kitScale, kitUrl } from "@/lib/hq/floorplans/kit";
import { goalForBox, idleAction, stepActor, worldOf, type Actor, type Goal } from "@/lib/hq/floorplans/catjump";
import { blocked, CAT_SCALE, freeSpot, obstacles, type Obstacle } from "@/lib/hq/floorplans/catwalk";
import { bowlObstacles, bubbleOf, dropTargetBowl, isBowlSet, passableItem, standOff, stepItems, stepSpot, stepStory, STORY_START, withoutItem, type NeedIcon, type Spot, type Story, type StoryState } from "@/lib/hq/floorplans/story";
import { expandRemovedIndices, type FurnitureMove, type FurnitureSupport } from "@/lib/hq/floorplans/experience-furniture";
import { boxToSolid, clampFurniturePose, rotatedHalfExtents, type SolidBody } from "@/lib/hq/floorplans/experience-physics";
import { focusScenes, houseScene, sceneBounds, type RoomScene, type SceneBox } from "@/lib/hq/floorplans/scene";
import type { BodyType } from "@/lib/hq/cat-models/types";
import { CatModel } from "./CatPreview";
import { bowlSlotsOf, detectBowlSlots, setBowlSlots } from "./bowlSlotsDetect";
import { readItemDragId } from "./itemDrag";
import type { PlanRoom } from "@/lib/hq/floorplans/types";
import type { SceneLight } from "@/lib/play/scene-light";
import { houseStainSpots, STAIN, type Stain } from "@/lib/play/urine-stain";
import { stainShape } from "./stain-mesh";
import { shotReach, type CameraShot } from "@/lib/play/camera-shot";
import { applyElderTint, type ElderCat } from "@/lib/play/elder-cat";
import { registerSceneGrab } from "@/lib/play/snapshot";
import { CAT_TINT_UNIFORM } from "@/lib/hq/rooms/splat-tint";
import { tintObject } from "@/lib/hq/rooms/tint-material";

/** 生活用品放在哪：null＝地板；有值＝家具頂面（PlanRoom.furniture 原始索引） */
export type ItemSupport = { furnitureIndex: number; localX: number; localZ: number } | null;

/** 把螢幕座標打到地板或可承載桌面，回傳該房間座標（給 HTML5 拖放用） */
export type FloorHit = { roomId: string; x: number; z: number; y: number; support: ItemSupport };
export type FloorRayApi = { hit: (clientX: number, clientY: number) => FloorHit | null };

/** 虛擬體驗放置的生活用品（#197）：位置在該房間座標，尺寸為公尺；y＝底部離地 */
export interface PlacedHouseholdItem {
  key: string;
  roomId: string;
  url: string;
  name: string;
  x: number;
  z: number;
  y: number;
  widthM: number;
  depthM: number;
  heightM: number;
  /** 水平旋轉角度（度）；生活用品預設 0，每次操作右轉 90 度。 */
  rotY?: number;
  support?: ItemSupport;
}

/** 可承載頂面：桌／床／櫃等（用品與可拆家具拖放用） */
const SUPPORT_KINDS = new Set(["desk", "table", "bed", "sofa", "wardrobe", "cabinet", "counter", "tv_stand"]);
function isSupportBox(b: SceneBox | undefined): b is SceneBox {
  return !!b && b.kind === "furniture" && (SUPPORT_KINDS.has(b.furniture ?? "") || !!b.walkable);
}

/** 命中點轉成房間座標（家具 drag group 會平移，不能只用 o.parent） */
function roomLocalPoint(from: THREE.Object3D, worldPoint: THREE.Vector3): THREE.Vector3 | null {
  let o: THREE.Object3D | null = from;
  while (o) {
    if (o.userData?.meowRoomRoot) return o.worldToLocal(worldPoint.clone());
    o = o.parent;
  }
  return from.parent ? from.parent.worldToLocal(worldPoint.clone()) : null;
}

/** 牆／窗台＋落地家具固態障礙；exclude＝自己與跟隨子孫；onSupport 時只擋牆不擋他家具 */
function solidObstacles(s: RoomScene, exclude: Set<number>, onSupport: boolean): SolidBody[] {
  return s.boxes.flatMap(b => {
    if (b.kind === "wall" || b.kind === "sill") return [boxToSolid(b)];
    if (onSupport) return [];
    if (b.kind !== "furniture" || b.furnitureIndex === undefined || exclude.has(b.furnitureIndex)) return [];
    if (b.y - b.sy / 2 > 0.08) return [];
    return [boxToSolid(b)];
  });
}

// 牆用 meowho_3d_room 的牆面漆色
const COLORS = { wall: "#EEE9E0", glass: "#BFD8E3" };
/** 面向鏡頭的牆降到這個高度（娃娃屋剖面），才看得到房間裡面 */
const CUT_M = 0.25;
const FOV = 38;

/**
 * 牆、門楣、窗台、玻璃：鏡頭在牆外側時（朝外方向和「牆→鏡頭」同向），牆降到 CUT_M、其餘先藏起來，
 * 轉到另一邊時自動恢復（比照 meowho_3d_room 的 open 版本，前面沒有牆擋住）。碰撞體不受影響。
 */
function WallPiece({ b, center }: { b: SceneBox; center: [number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m || !b.out || !m.parent) return;
    // 以房間中心判斷鏡頭在哪一側（鏡頭靠近房間時，用每段牆自己的位置會漏掉斜前方的牆）
    m.parent.localToWorld(tmp.set(center[0], 0, center[1]));
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

type FurnitureDraft = { x: number; z: number; elev: number; rot: number; support: FurnitureSupport | null };

/** 家具：glb；手掌模式可拖（地板／他家具頂）、固態夾制；操作列 ×／右轉 90° */
function Furniture({ b, room, roomId, boxIndex, planFurniture, onClick, onRemove, onRotate, dragEnabled, onMove }: {
  b: SceneBox; room: RoomScene; roomId: string; boxIndex: number;
  planFurniture: { parent?: number }[];
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onRemove?: (roomId: string, furnitureIndex: number) => void;
  onRotate?: (roomId: string, furnitureIndex: number) => void;
  dragEnabled?: boolean;
  onMove?: (roomId: string, furnitureIndex: number, next: FurnitureMove, prev: FurnitureMove) => void;
}) {
  const { scene } = useGLTF(kitUrl(b.furniture ?? "other"));
  const group = useRef<THREE.Group>(null);
  const elevRef = useRef(b.y - b.sy / 2);
  const dragging = useRef(false);
  const rotDeg = (-b.rotY * 180) / Math.PI;
  const start = useRef<FurnitureMove>({ x: b.x, z: b.z, rot: rotDeg, support: null });
  const draft = useRef<FurnitureDraft>({ x: b.x, z: b.z, elev: b.y - b.sy / 2, rot: rotDeg, support: null });
  const controls = useThree(s => s.controls) as { enabled: boolean } | null;
  const { camera, pointer, raycaster, scene: threeScene } = useThree();
  const model = useMemo(() => {
    const m = scene.clone(true);
    m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return m;
  }, [scene]);
  const planIndex = b.furnitureIndex ?? boxIndex;
  const canDrag = !!(dragEnabled && onMove && b.movable && b.furnitureIndex !== undefined);
  const forbid = useMemo(
    () => (b.furnitureIndex === undefined ? new Set<number>() : expandRemovedIndices(planFurniture, new Set([b.furnitureIndex]))),
    [planFurniture, b.furnitureIndex],
  );
  const support = isSupportBox(b);
  const supportData = support ? {
    meowSupportRoomId: roomId,
    meowSupportIndex: planIndex,
    meowSupportTopY: b.y + b.sy / 2,
    meowSupportCx: b.x,
    meowSupportCz: b.z,
  } : undefined;
  const label = b.furniture ?? "家具";

  const applyClamp = (x: number, z: number, rot: number, onSupport: boolean) => {
    const half = rotatedHalfExtents(b.sx, b.sz, rot);
    // 牆永遠擋；onSupport 時不與其他落地家具互斥（仍不可穿牆）
    const obstacles = solidObstacles(room, forbid, onSupport);
    return clampFurniturePose({ x, z }, half, room.size, obstacles, { inset: 0.02 });
  };

  const toMove = (d: FurnitureDraft): FurnitureMove => ({
    x: d.x, z: d.z, rot: d.rot, support: d.support,
  });

  useEffect(() => {
    if (dragging.current) return;
    const elev = b.y - b.sy / 2;
    elevRef.current = elev;
    group.current?.position.set(b.x, elev, b.z);
    const pose: FurnitureDraft = { x: b.x, z: b.z, elev, rot: (-b.rotY * 180) / Math.PI, support: null };
    start.current = toMove(pose);
    draft.current = pose;
  }, [b.x, b.z, b.y, b.sy, b.rotY]);

  useEffect(() => {
    const end = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (controls) controls.enabled = true;
      document.body.style.cursor = "";
      if (onMove && b.furnitureIndex !== undefined) {
        const clamped = applyClamp(draft.current.x, draft.current.z, draft.current.rot, !!draft.current.support);
        draft.current = { ...draft.current, ...clamped };
        onMove(roomId, b.furnitureIndex, toMove(draft.current), start.current);
      }
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [controls, onMove, roomId, b.furnitureIndex, b.sx, b.sz, room, forbid]);

  useFrame(() => {
    if (!dragging.current || !group.current?.parent) return;
    raycaster.setFromCamera(pointer, camera);
    for (const h of raycaster.intersectObjects(threeScene.children, true)) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const supportRoom = o.userData?.meowSupportRoomId as string | undefined;
        const supportIndex = o.userData?.meowSupportIndex as number | undefined;
        if (supportRoom === roomId && typeof supportIndex === "number" && !forbid.has(supportIndex)) {
          const p = roomLocalPoint(o, h.point);
          if (!p) return;
          const topY = o.userData.meowSupportTopY as number;
          const cx = (o.userData.meowSupportCx as number) ?? p.x;
          const cz = (o.userData.meowSupportCz as number) ?? p.z;
          const clamped = applyClamp(p.x, p.z, draft.current.rot, true);
          draft.current = {
            x: clamped.x, z: clamped.z, elev: topY, rot: draft.current.rot,
            support: { furnitureIndex: supportIndex, localX: clamped.x - cx, localZ: clamped.z - cz },
          };
          elevRef.current = topY;
          group.current.position.set(clamped.x, topY, clamped.z);
          return;
        }
        if (o.userData?.meowFloorRoomId === roomId) {
          const p = roomLocalPoint(o, h.point);
          if (!p) return;
          const clamped = applyClamp(p.x, p.z, draft.current.rot, false);
          draft.current = { x: clamped.x, z: clamped.z, elev: 0, rot: draft.current.rot, support: null };
          elevRef.current = 0;
          group.current.position.set(clamped.x, 0, clamped.z);
          group.current.traverse(node => {
            if (node.userData?.meowSupportRoomId === roomId) {
              node.userData.meowSupportCx = clamped.x;
              node.userData.meowSupportCz = clamped.z;
              node.userData.meowSupportTopY = b.sy;
            }
          });
          return;
        }
        o = o.parent;
      }
    }
  });

  const showOps = !!(onRemove || onRotate) && b.furnitureIndex !== undefined;
  const baseElev = b.y - b.sy / 2;

  return (
    <group
      ref={group}
      position={[b.x, baseElev, b.z]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (!canDrag) return;
        e.stopPropagation();
        dragging.current = true;
        const pose: FurnitureDraft = {
          x: b.x, z: b.z, elev: baseElev, rot: (-b.rotY * 180) / Math.PI, support: null,
        };
        start.current = toMove(pose);
        draft.current = pose;
        elevRef.current = pose.elev;
        if (controls) controls.enabled = false;
        document.body.style.cursor = "grabbing";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (canDrag) e.stopPropagation();
      }}
    >
      <primitive
        object={model}
        position={[0, 0, 0]}
        rotation={[0, b.rotY, 0]}
        scale={kitScale(b.furniture ?? "other", { w: b.sx, h: b.sy, d: b.sz })}
        userData={supportData}
      />
      {onClick && (
        <mesh position={[0, b.sy / 2, 0]} rotation={[0, b.rotY, 0]} onClick={onClick} userData={supportData}>
          <boxGeometry args={[b.sx, b.sy, b.sz]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {showOps && (
        <Html position={[0, b.sy + 0.12, 0]} center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
          <div className="hq-fp-item-ops" style={{ pointerEvents: "auto" }}>
            {onRotate && (
              <button
                type="button"
                className="hq-fp-item-x"
                aria-label="右轉 90 度"
                onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                onClick={e => { e.stopPropagation(); onRotate(roomId, b.furnitureIndex!); }}
              >↻</button>
            )}
            {onRemove && (
              <button
                type="button"
                className="hq-fp-item-x"
                aria-label={`移除 ${label}`}
                onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                onClick={e => { e.stopPropagation(); onRemove(roomId, b.furnitureIndex!); }}
              >×</button>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

type MovePayload = { x: number; z: number; y: number; rotY: number; support: ItemSupport };

/** 生活用品：依量到的公尺尺寸縮放；可放地板或桌面；手掌模式可拖移；上方 × 可刪除；落地物貓會繞過 */
function PlacedItemModel({ item, room, dragEnabled, onMove, onRotate, onRemove }: {
  item: PlacedHouseholdItem;
  room: RoomScene;
  dragEnabled: boolean;
  onMove?: (key: string, place: MovePayload) => void;
  onRotate?: (key: string) => void;
  onRemove?: (key: string) => void;
}) {
  const { scene } = useGLTF(item.url);
  const group = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const draft = useRef<MovePayload>({ x: item.x, z: item.z, y: item.y, rotY: item.rotY ?? 0, support: item.support ?? null });
  const controls = useThree(s => s.controls) as { enabled: boolean } | null;
  const { camera, pointer, raycaster, scene: threeScene } = useThree();
  const prepared = useMemo(() => {
    const m = scene.clone(true);
    m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const sx = item.widthM / Math.max(size.x, 1e-4);
    const sy = item.heightM / Math.max(size.y, 1e-4);
    const sz = item.depthM / Math.max(size.z, 1e-4);
    return { m, scale: [sx, sy, sz] as [number, number, number], base: -box.min.y * sy };
  }, [scene, item.widthM, item.heightM, item.depthM]);

  const worldY = (elev: number) => elev + prepared.base;

  // 餐碗組（#304）：讀模型顏色找飼料碗與水碗，給貓咪故事線用
  useEffect(() => {
    if (!isBowlSet(item.name)) return;
    setBowlSlots(item.key, detectBowlSlots(prepared.m, prepared.scale));
    return () => setBowlSlots(item.key, null);
  }, [item.key, item.name, prepared]);

  useEffect(() => {
    if (dragging.current) return;
    group.current?.position.set(item.x, worldY(item.y), item.z);
    group.current && (group.current.rotation.y = THREE.MathUtils.degToRad(item.rotY ?? 0));
    draft.current = { x: item.x, z: item.z, y: item.y, rotY: item.rotY ?? 0, support: item.support ?? null };
  }, [item.x, item.z, item.y, item.rotY, item.support, prepared.base]);

  useEffect(() => {
    const end = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (controls) controls.enabled = true;
      if (onMove) onMove(item.key, draft.current);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [controls, item.key, onMove]);

  useFrame(() => {
    if (!dragging.current || !group.current?.parent) return;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(threeScene.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const supportRoom = o.userData?.meowSupportRoomId as string | undefined;
        const floorRoom = o.userData?.meowFloorRoomId as string | undefined;
        if (supportRoom === item.roomId) {
          const p = roomLocalPoint(o, h.point);
          if (!p) return;
          const idx = o.userData.meowSupportIndex as number;
          const topY = o.userData.meowSupportTopY as number;
          const cx = (o.userData.meowSupportCx as number) ?? p.x;
          const cz = (o.userData.meowSupportCz as number) ?? p.z;
          draft.current = {
            x: p.x, z: p.z, y: topY, rotY: item.rotY ?? 0,
            support: { furnitureIndex: idx, localX: p.x - cx, localZ: p.z - cz },
          };
          group.current.position.set(p.x, worldY(topY), p.z);
          return;
        }
        if (floorRoom === item.roomId) {
          const p = roomLocalPoint(o, h.point);
          if (!p) return;
          draft.current = { x: p.x, z: p.z, y: 0, rotY: item.rotY ?? 0, support: null };
          group.current.position.set(p.x, worldY(0), p.z);
          return;
        }
        o = o.parent;
      }
    }
  });

  return (
    <group
      ref={group}
      position={[item.x, worldY(item.y), item.z]}
      rotation={[0, THREE.MathUtils.degToRad(item.rotY ?? 0), 0]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (!dragEnabled || !onMove) return;
        e.stopPropagation();
        dragging.current = true;
        if (controls) controls.enabled = false;
        document.body.style.cursor = "grabbing";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (dragEnabled) e.stopPropagation();
      }}
    >
      <primitive object={prepared.m} scale={prepared.scale} />
      {(onRotate || onRemove) && (
        <Html position={[0, item.heightM + 0.12, 0]} center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
          <div className="hq-fp-item-ops" style={{ pointerEvents: "auto" }}>
            {onRotate && (
              <button
                type="button"
                className="hq-fp-item-x"
                aria-label={`右轉 ${item.name} 90 度`}
                onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                onClick={e => { e.stopPropagation(); onRotate(item.key); }}
              >↻</button>
            )}
            {onRemove && (
              <button
                type="button"
                className="hq-fp-item-x"
                aria-label={`移除 ${item.name}`}
                onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                onClick={e => { e.stopPropagation(); onRemove(item.key); }}
              >×</button>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

/** 把 HTML 拖放的螢幕座標轉成房間地板或桌面座標 */
function FloorRayBridge({ api }: { api: MutableRefObject<FloorRayApi | null> }) {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  useEffect(() => {
    api.current = {
      hit(clientX, clientY) {
        const rect = gl.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        for (const h of raycaster.intersectObjects(scene.children, true)) {
          let o: THREE.Object3D | null = h.object;
          while (o) {
            const supportRoom = o.userData?.meowSupportRoomId as string | undefined;
            if (supportRoom) {
              const p = roomLocalPoint(o, h.point);
              if (!p) return null;
              const idx = o.userData.meowSupportIndex as number;
              const cx = o.userData.meowSupportCx as number;
              const cz = o.userData.meowSupportCz as number;
              return {
                roomId: supportRoom, x: p.x, z: p.z, y: o.userData.meowSupportTopY as number,
                support: { furnitureIndex: idx, localX: p.x - cx, localZ: p.z - cz },
              };
            }
            const roomId = o.userData?.meowFloorRoomId as string | undefined;
            if (roomId) {
              const p = roomLocalPoint(o, h.point);
              if (!p) return null;
              return { roomId, x: p.x, z: p.z, y: 0, support: null };
            }
            o = o.parent;
          }
        }
        return null;
      },
    };
    return () => { api.current = null; };
  });
  return null;
}

/** 桌上小物不另建障礙（已有家具碰撞）；落地物才繞行 */
function itemObstacles(items: PlacedHouseholdItem[]): Obstacle[] {
  return items
    .filter(i => !i.support)
    .map(i => ({ x: i.x, z: i.z, hx: i.widthM / 2, hz: i.depthM / 2, rotY: THREE.MathUtils.degToRad(i.rotY ?? 0) }));
}

/** 生活用品模型載入失敗（離線、遠端網址失效）時改畫同尺寸的簡單方塊（#237） */
class ItemBoundary extends Component<{ fallback: ReactNode; onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ItemBox({ item }: { item: PlacedHouseholdItem }) {
  return (
    <mesh position={[item.x, item.y + item.heightM / 2, item.z]} castShadow receiveShadow>
      <boxGeometry args={[item.widthM, item.heightM, item.depthM]} />
      <meshStandardMaterial color="#E8A35C" roughness={0.8} />
    </mesh>
  );
}

/** 地板：橡木貼圖，每 1.2 公尺重複一次；userData 供拖放 raycast 對到房間 */
function Floor({ b, roomId, onClick }: { b: SceneBox; roomId: string; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
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
    <mesh position={[b.x, b.y, b.z]} receiveShadow onClick={onClick} userData={{ meowFloorRoomId: roomId }}>
      <boxGeometry args={[b.sx, b.sy, b.sz]} />
      <meshStandardMaterial map={maps[0]} normalMap={maps[1]} roughness={0.55} />
    </mesh>
  );
}

/** 點到的東西：地板，或第 box 個方塊（家具）；x、z 是這間房的座標（公尺） */
export type RoomClick = { box: number | null; x: number; z: number };

function Room({ s, planFurniture, onClick, onRemoveFurniture, onRotateFurniture, furnitureDrag, onMoveFurniture, children }: {
  s: RoomScene;
  planFurniture: { parent?: number }[];
  onClick: (c: RoomClick) => void;
  onRemoveFurniture?: (roomId: string, furnitureIndex: number) => void;
  onRotateFurniture?: (roomId: string, furnitureIndex: number) => void;
  furnitureDrag?: boolean;
  onMoveFurniture?: (roomId: string, furnitureIndex: number, next: FurnitureMove, prev: FurnitureMove) => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  // 世界座標 → 這間房的座標；同一次點擊只處理最前面那個（家具擋在地板前面時算家具）
  const handle = (box: number | null) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = ref.current ? ref.current.worldToLocal(e.point.clone()) : e.point;
    onClick({ box, x: p.x, z: p.z });
  };
  return (
    <group ref={ref} position={[s.offset[0], 0, s.offset[1]]} userData={{ meowRoomRoot: true, meowRoomId: s.id }}>
      {children}
      {s.boxes.map((b, i) =>
        b.kind === "floor" ? (
          <Suspense key={i} fallback={<Block b={b} color="#D9CCB4" />}><Floor b={b} roomId={s.id} onClick={handle(null)} /></Suspense>
        ) : b.kind === "furniture" ? (
          <Suspense key={`${s.id}:f:${b.furnitureIndex ?? i}`} fallback={<Block b={b} color="#D8D2C8" />}>
            <Furniture
              b={b} room={s} roomId={s.id} boxIndex={i} planFurniture={planFurniture}
              onClick={handle(i)}
              onRemove={onRemoveFurniture}
              onRotate={onRotateFurniture}
              dragEnabled={furnitureDrag}
              onMove={onMoveFurniture}
            />
          </Suspense>
        ) : (
          <WallPiece key={i} b={b} center={[s.size[0] / 2, s.size[1] / 2]} />
        ))}
    </group>
  );
}

/** 尿漬貼片（#354）：地板上的扁平淡黃半透明塊，不吃燈光（夜晚也看得到） */
function StainDecals({ scene, stains }: { scene: RoomScene; stains: readonly Stain[] }) {
  const spots = useMemo(() => houseStainSpots(scene, stains), [scene, stains]);
  return (
    <>
      {spots.map(sp => (
        <group key={sp.id} position={[sp.x, 0.012, sp.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
          <mesh>
            <shapeGeometry args={[stainShape(sp.id, sp.r)]} />
            <meshBasicMaterial color={STAIN.color} transparent opacity={STAIN.opacity} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
          <mesh position={[0, 0, 0.003]}>
            <shapeGeometry args={[stainShape(`${sp.id}-core`, sp.r * 0.55)]} />
            <meshBasicMaterial color={STAIN.core} transparent opacity={STAIN.opacity} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
        </group>
      ))}
    </>
  );
}

export interface ViewerCat { baseUrl: string; albedoUrl: string; body: BodyType }

const CAT_FUR = { inPlace: true, only: (m: THREE.Material) => m.name === "cat_fur" };

/**
 * 虛擬體驗（#150）：貓在房間裡走、跳上家具。點地板＝走過去；點床、沙發、桌子＝走到旁邊跳上去；
 * 走路與跳躍播 walk（母體還沒有 jump 動作）、停下播 idle；閒置時在地板上逛、在床或沙發上睡覺。
 * 規則在 catwalk.ts、catjump.ts（純函式、可測）；貓放大 CAT_SCALE 倍（真實比例在整間房的鏡頭裡太小）。
 * pos：貓的世界座標，給鏡頭跟隨用。
 */
function CatActor({ s, look, click, pos, extraObs, forceClip = null, speed = 1, story = null, items = [], onStory, elder = null, tint = null }: {
  s: RoomScene; look: ViewerCat; click: (RoomClick & { at: number }) | null; pos: React.RefObject<THREE.Vector3>;
  extraObs: Obstacle[];
  /** 停下來時固定播這個動作（例如 sleep），不自己閒逛（#237 虛擬飼養劇情） */
  forceClip?: string | null;
  /** 走路與動作速度倍率（#237：老貓放慢） */
  speed?: number;
  /** 故事線（#297，MeowHQ 虛擬體驗）；null＝不跑（前台試養遊戲） */
  story?: Story | null;
  /** 這間房已放的生活用品（故事線找碗、貓砂盆用） */
  items?: PlacedHouseholdItem[];
  /** 故事線狀態改變時通知（畫面顯示進度） */
  onStory?: (st: StoryState) => void;
  /** 老貓（#354 結局，lib/play/elder-cat.ts）：毛色調淡偏灰、縮小一點；null＝原本的樣子 */
  elder?: ElderCat | null;
  /** 虛擬飼養日夜（#354）：貓的材質輸出乘上這個向量；null＝不改材質 */
  tint?: THREE.Vector3 | null;
}) {
  // 模型是非同步載入的，所以每幀檢查一次（已套過的不重算）；換回 null 時還原一次就停
  const tinted = useRef(false);
  useFrame(() => {
    if (!elder && !tinted.current) return;
    applyElderTint(ref.current, elder);
    tinted.current = Boolean(elder);
  });
  const world = useMemo(() => worldOf(s, [...obstacles(s), ...extraObs]), [s, extraObs]);
  const start = useMemo(() => freeSpot(s, world.obs) ?? { x: s.size[0] / 2, z: s.size[1] / 2 }, [s, world]);
  const ref = useRef<THREE.Group>(null);
  const cat = useRef<Actor>({ ...start, y: 0, heading: 0, moving: false, on: null, jump: null });
  const goal = useRef<Goal | null>(null);
  const idle = useRef(0);
  const [clip, setClip] = useState("idle");
  const plot = useRef<StoryState>(STORY_START);
  const spot = useRef<Spot | null>(null);
  /** 目前的 goal 是故事線給的（不是玩家點的） */
  const storyGoal = useRef(false);
  const [bubble, setBubble] = useState<NeedIcon | null>(null);
  const [bubbleLabel, setBubbleLabel] = useState("");
  useEffect(() => {
    if (!click) return;
    storyGoal.current = false;
    goal.current = (click.box !== null && goalForBox(world, click.box, click.x, click.z)) || { x: click.x, z: click.z, surface: null };
    idle.current = 0;
  }, [click, world]);
  const tintSweep = useRef(0);
  // 只改毛色：CatPreview 每隻貓自己複製一份 cat_fur（換貼圖還拿著它），直接改它；其他材質是快取共用的，不碰
  useFrame((_, delta) => {
    // 貓模型（Suspense 載入、換年紀會換）的材質換成乘 tint 的複本；每 20 幀掃一次新材質
    if (tint && ref.current && --tintSweep.current <= 0) { tintSweep.current = 20; tintObject(ref.current, CAT_TINT_UNIFORM, tint, CAT_FUR); }
    const dt = Math.min(delta, 0.1) * speed;
    // 故事線（#318）：碗有自己的碰撞（餐碗組＝兩個碗），最後靠近時拿掉要吃的那個
    const bowls = story ? bowlObstacles(story, items, bowlSlotsOf) : [];
    if (story) storyStep(story, dt, bowls);
    const walkWorld = bowls.length ? { ...world, obs: [...world.obs, ...dropTargetBowl(bowls, spot.current, cat.current)] } : world;
    const { actor, done } = stepActor(cat.current, goal.current, walkWorld, dt);
    let next = clip;
    if (done) goal.current = null;
    const doing = story && plot.current.phase === "doing" ? story.steps[plot.current.step] : null;
    if (doing && spot.current) {
      // 做動作時慢慢貼到站位上（走路停下時可能差幾公分），頭才會剛好在碗上方
      const k = Math.min(1, dt * 6);
      actor.x += (spot.current.x - actor.x) * k;
      actor.z += (spot.current.z - actor.z) * k;
      actor.heading = spot.current.heading;
    }
    if (actor.moving || actor.jump) { idle.current = 0; next = "walk"; }
    else if (forceClip) next = forceClip;
    else if (doing) { idle.current = 0; next = doing.clip; }
    else {
      idle.current += dt;
      if (next === "walk" || next === "eat" || next === "drink" || next === "toilet") next = "idle";
      if (idle.current > 6 && next !== "sleep") {
        const what = idleAction(actor, world);
        if (what.sleep) next = "sleep";
        else if (what.wander) { goal.current = what.wander; idle.current = 0; }
      }
    }
    cat.current = actor;
    // 抬高 1 公分：走路動作的腳掌會略低於地面，貼著檯面時看起來像陷進去
    ref.current?.position.set(actor.x, actor.y + 0.01, actor.z);
    ref.current?.rotation.set(0, actor.heading, 0);
    ref.current?.getWorldPosition(pos.current);
    if (next !== clip) setClip(next);
    const need = story ? bubbleOf(story, plot.current) : null;
    if ((need?.icon ?? null) !== bubble) { setBubble(need?.icon ?? null); setBubbleLabel(need?.label ?? ""); }
  });

  /** 故事線一格：找這一步最近的用品與站位 → 推進狀態 → 需要時叫貓走過去 */
  function storyStep(story: Story, dt: number, bowls: Obstacle[]) {
    const a = cat.current;
    const st = plot.current;
    if (st.phase === "done") return;
    const step = story.steps[st.step];
    const item = stepItems(step, items).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0];
    // 做動作中固定站位；其他時候跟著用品重算（被拖走、換一個）
    if (st.phase !== "doing" || !item || spot.current?.item !== item.key) {
      spot.current = item
        ? stepSpot(step, item, a, (x, z, target) => {
          // 站位檢查：牆、家具用貓的碰撞半徑；其他碗用貓身體的半寬（要吃的那個碗不算，站位本來就緊貼它）
          const others = bowls.filter(o => Math.hypot(o.x - target.x, o.z - target.z) > 1e-3);
          return blocked(x, z, s, withoutItem(world.obs, item)) || (others.length > 0 && blocked(x, z, s, others, 0.12));
        }, { reach: standOff(look.body), slots: bowlSlotsOf(item.key) })
        : null;
    }
    const sp = spot.current;
    const near = !!sp && !a.jump && a.on === null && Math.hypot(a.x - sp.x, a.z - sp.z) < 0.12;
    // 走到了：故事線給的目標收掉（貼著用品時可能差幾公分到不了 ARRIVE_M，不收會一直原地踏步）
    const close = !!sp && Math.hypot(a.x - sp.x, a.z - sp.z) < 0.05;
    if (near && storyGoal.current && (close || !a.moving)) { goal.current = null; storyGoal.current = false; }
    const arrived = near && !goal.current;
    // 做到一半被玩家叫走：回到走過去
    const base = st.phase === "doing" && goal.current ? { ...st, phase: "going" as const, t: 0 } : st;
    const nextSt = stepStory(story, base, { has: !!item, spot: !!sp, arrived, dt });
    if (nextSt.step !== st.step || nextSt.phase !== st.phase) onStory?.(nextSt);
    plot.current = nextSt;
    if (nextSt.phase !== "going" || !sp || arrived) { storyGoal.current = false; return; }
    // 走過去：玩家點的地方走完了才接手；站位變了就改目標
    const g = goal.current;
    if (!g || (storyGoal.current && Math.hypot(g.x - sp.x, g.z - sp.z) > 0.05)) {
      goal.current = { x: sp.x, z: sp.z, surface: null };
      storyGoal.current = true;
    }
  }

  return (
    <group ref={ref} position={[start.x, 0, start.z]} scale={CAT_SCALE * (elder?.scale ?? 1)}>
      <Suspense fallback={null}>
        <CatModel baseUrl={look.baseUrl} albedoUrl={look.albedoUrl} clip={clip} follow={false} speed={speed} />
      </Suspense>
      {bubble && (
        <Html position={[0, look.body === "kitten" ? 0.42 : 0.62, 0]} center zIndexRange={[40, 30]} style={{ pointerEvents: "none" }}>
          <div className="hq-exp-bubble" role="status" aria-label={bubbleLabel}>
            <NeedGlyph icon={bubble} />
          </div>
        </Html>
      )}
    </group>
  );
}

/** 故事線對話框裡的線條圖示（不用 emoji） */
function NeedGlyph({ icon }: { icon: NeedIcon }) {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon === "bowl" && <>
        <path d="M3 11.5h18a8 8 0 0 1-8 7.5h-2a8 8 0 0 1-8-7.5Z" />
        <path d="M7.5 19.5h9" />
        <circle cx={9} cy={8.6} r={1.1} /><circle cx={12.4} cy={7.4} r={1.1} /><circle cx={15.4} cy={9} r={1.1} />
      </>}
      {icon === "water" && <path d="M12 3.5c3.3 4 5.5 7 5.5 9.8a5.5 5.5 0 0 1-11 0C6.5 10.5 8.7 7.5 12 3.5Z" />}
      {icon === "litter" && <>
        <path d="M3.5 11h17l-1.6 7.5a1.5 1.5 0 0 1-1.5 1.2H6.6a1.5 1.5 0 0 1-1.5-1.2L3.5 11Z" />
        <path d="M7 11c1-1.6 2.2-1.6 3.2 0M11.8 11c1-1.6 2.2-1.6 3.2 0" />
        <path d="M14.5 6.2c.6-1.3 2.2-1.3 2.8 0M16 3.8v.2M18.6 5v.2M13 5v.2" />
      </>}
    </svg>
  );
}

/** 虛擬體驗：鏡頭跟著貓（旋轉中心慢慢移到貓身上，鏡頭一起平移；管理員自己轉的角度、縮放保留） */
function FollowCat({ pos }: { pos: React.RefObject<THREE.Vector3> }) {
  const camera = useThree(st => st.camera);
  const controls = useThree(st => st.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const want = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    if (!controls || !pos.current) return;
    want.copy(pos.current).setY(pos.current.y + 0.25);
    const k = Math.min(1, delta * 3);
    const dx = (want.x - controls.target.x) * k, dy = (want.y - controls.target.y) * k, dz = (want.z - controls.target.z) * k;
    controls.target.set(controls.target.x + dx, controls.target.y + dy, controls.target.z + dz);
    camera.position.set(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
    controls.update();
  });
  return null;
}

/** 結局回顧的截圖（#354）：登記「現在畫一幀、回傳畫布」，截圖在同一個工作裡讀，不用全域 preserveDrawingBuffer */
function SceneGrab() {
  const { gl, scene, camera } = useThree();
  useEffect(() => registerSceneGrab(() => { gl.render(scene, camera); return gl.domElement; }), [gl, scene, camera]);
  return null;
}

/** 虛擬飼養的劇情鏡頭（#354，lib/play/camera-shot.ts）：key 一變，等 delayMs，再花 ms 把鏡頭移到旋轉中心（貓）前 dist 公尺、
 *  高 height 公尺；方向沿用鏡頭當下的水平方向。只改鏡頭相對旋轉中心的位置，FollowCat 照舊跟著貓平移 */
function ShotRig({ shot }: { shot: CameraShot | null }) {
  const camera = useThree(st => st.camera);
  const controls = useThree(st => st.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number; ms: number } | null>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const shotRef = useRef(shot);
  shotRef.current = shot;
  const key = shot?.key ?? null;
  useEffect(() => {
    const s = shotRef.current;
    if (!s) return;
    const t = window.setTimeout(() => {
      if (!controls) return;
      const from = camera.position.clone().sub(controls.target);
      const flat = new THREE.Vector3(from.x, 0, from.z);
      if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
      const size = (camera as THREE.PerspectiveCamera).aspect || 1;
      const { dist, height } = shotReach(s, size);
      const to = flat.normalize().multiplyScalar(dist).setY(height);
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      anim.current = { from, to, start: performance.now(), ms: still ? 0 : s.ms };
    }, s.delayMs);
    return () => window.clearTimeout(t);
  }, [key, camera, controls]);
  useFrame(() => {
    const a = anim.current;
    if (!a || !controls) return;
    const t = a.ms ? Math.min(1, (performance.now() - a.start) / a.ms) : 1;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;  // 慢進慢出
    camera.position.copy(controls.target).add(tmp.lerpVectors(a.from, a.to, e));
    controls.update();
    if (t === 1) anim.current = null;
  });
  return null;
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
export type PlaceAt = { roomId: string; x: number; z: number; y: number; support: ItemSupport };
/** point＝點地板／床叫貓；hand＝拖移已放用品／落地家具（不叫貓） */
export type InteractMode = "point" | "hand";

export default function FloorplanViewer({ rooms, selected, onPick, cat, placedItems = [], interactMode = "point", removedFurniture, furnitureMoves, onMoveItem, onRotateItem, onRemoveItem, onRemoveFurniture, onMoveFurniture, onRotateFurniture, onFloorDrop, catGoal = null, catClip = null, catSpeed = 1, onItemError, story = null, onStory, light = null, shot = null, stains = null, elder = null, capture = false }: {
  rooms: PlanRoom[]; selected: string | null; onPick: (id: string) => void;
  /** 虛擬體驗（#150）：放一隻貓進去；有貓時只顯示單間（沒有「全部」），點地板叫貓走過去 */
  cat?: ViewerCat | null;
  /** 虛擬體驗（#197）：已放進房間的生活用品；只能從右側選單拖放進來，點地板不會新增 */
  placedItems?: PlacedHouseholdItem[];
  /** 點／手掌：點＝叫貓；手掌＝拖移用品／家具、移除家具 */
  interactMode?: InteractMode;
  /** 本次體驗暫時拿掉的讀圖家具（`roomId:index`） */
  removedFurniture?: Iterable<string>;
  /** 本次體驗家具拖移姿態（`roomId:index` → 房間座標） */
  furnitureMoves?: Record<string, FurnitureMove>;
  /** 拖移已放置的用品（可改到桌面或地板） */
  onMoveItem?: (key: string, at: MovePayload) => void;
  /** 生活用品右轉 90° */
  onRotateItem?: (key: string) => void;
  /** 移除已放置的用品（元件上方 ×） */
  onRemoveItem?: (key: string) => void;
  /** 暫時移除讀圖家具（手掌模式 ×） */
  onRemoveFurniture?: (roomId: string, furnitureIndex: number) => void;
  /** 拖移讀圖家具（地板或他家具頂面） */
  onMoveFurniture?: (roomId: string, furnitureIndex: number, next: FurnitureMove, prev: FurnitureMove) => void;
  /** 讀圖家具右轉 90° */
  onRotateFurniture?: (roomId: string, furnitureIndex: number) => void;
  /** 從右側選單拖放到地板或桌面 */
  onFloorDrop?: (itemId: string, at: PlaceAt) => void;
  /** 程式指定貓走去哪（#237 虛擬飼養劇情）；at 比玩家點擊新時才採用 */
  catGoal?: (RoomClick & { at: number }) | null;
  /** 貓停下來時固定播的動作（#237） */
  catClip?: string | null;
  /** 貓的動作速度倍率（#237） */
  catSpeed?: number;
  /** 生活用品模型載入失敗、已改成方塊（#237） */
  onItemError?: (key: string) => void;
  /** 故事線（#297，MeowHQ 虛擬體驗）：例如「貓咪的吃喝拉撒」；null＝自由活動 */
  story?: Story | null;
  /** 故事線進度改變 */
  onStory?: (st: StoryState) => void;
  /** 虛擬飼養的白天／夜晚光（#354，lib/play/scene-light.ts 的 lightFor(time).house）；null／不給＝原本的燈光（MeowHQ） */
  light?: SceneLight["house"] | null;
  /** 尿漬（#354，lib/play/urine-stain.ts 的 stainsFor）；null／不給＝沒有（預設）。只畫在第一間房 */
  stains?: readonly Stain[] | null;
  /** 虛擬飼養的劇情鏡頭（#354，lib/play/camera-shot.ts 的 shotFor）；null／不給＝原本的鏡頭（預設） */
  shot?: CameraShot | null;
  /** 老貓的樣子（#354 結局，lib/play/elder-cat.ts）；null／不給＝原本的樣子 */
  elder?: ElderCat | null;
  /** 登記結局回顧的截圖（#354，lib/play/snapshot.ts）；只有虛擬飼養要 */
  capture?: boolean;
}) {
  const removedList = useMemo(
    () => (removedFurniture ? [...removedFurniture] : []),
    [removedFurniture],
  );
  const scenes = useMemo(
    () => houseScene(rooms, removedList, furnitureMoves),
    [rooms, removedList, furnitureMoves],
  );
  const [focus, setFocus] = useState<string | null>(cat ? selected ?? scenes[0]?.id ?? null : null);
  const [click, setClick] = useState<(RoomClick & { at: number }) | null>(null);
  const catClick = catGoal && (!click || catGoal.at >= click.at) ? catGoal : click;
  const catPos = useRef(new THREE.Vector3());
  // 夜晚貓的顏色乘數（#354）：只乘貓的材質，不加點光源（點光源會照亮旁邊的用品）；換日夜只改值
  const catTint = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const [tr, tg, tb] = light?.catTint ?? [1, 1, 1];
  useEffect(() => { catTint.set(tr, tg, tb); }, [catTint, tr, tg, tb]);
  const floorRay = useRef<FloorRayApi | null>(null);
  const shown = useMemo(() => focusScenes(scenes, focus), [scenes, focus]);
  const { width, depth, height } = sceneBounds(shown);
  const half = Math.max(width, depth) / 2 + 2;
  // 畫面寬高比：桌機約 2.5、手機約 1.1（hq.css 的 .hq-fp-3d）；取保守值讓兩邊都框得住
  // 有貓時鏡頭近一點（約 3.5 公尺），之後跟著貓走；縮小仍可看整間
  const cam = cat ? cameraFor(2.2, 2.2, 1, 1.6) : cameraFor(width, depth, height, 1.6);
  const view = focus ?? "all";
  // 在下方房間清單切換時，單間模式跟著換到那一間（全部模式不動）
  useEffect(() => { setFocus(f => (f && selected && f !== selected ? selected : f)); }, [selected]);
  const pick = (id: string) => { setFocus(id); setClick(null); onPick(id); };

  const acceptDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!onFloorDrop) return;
    e.preventDefault();
    const itemId = readItemDragId(e.dataTransfer);
    const hit = floorRay.current?.hit(e.clientX, e.clientY);
    if (itemId && hit) onFloorDrop(itemId, { roomId: hit.roomId, x: hit.x, z: hit.z, y: hit.y, support: hit.support });
  };

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
      <div
        className="hq-fp-3d"
        onDragOver={onFloorDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } : undefined}
        onDrop={onFloorDrop ? acceptDrop : undefined}
      >
        <Canvas shadows={{ type: THREE.PCFSoftShadowMap }} camera={{ position: cam.position, fov: FOV, near: 0.1, far: 500 }}>
          <color attach="background" args={[light?.background ?? "#F3EFE7"]} />
          <hemisphereLight args={[light?.hemi.sky ?? "#fffaf2", light?.hemi.ground ?? "#d8ccb8", light?.hemi.intensity ?? 1.7]} />
          <ambientLight intensity={light?.ambient ?? 0.35} />
          {/* 顯示的房間移到原點附近：平行光的目標是原點，陰影範圍才會罩住所有房間 */}
          <directionalLight position={[-4, 8, 5]} intensity={light?.sun.intensity ?? 2.2} color={light?.sun.color ?? "#fff6e8"} castShadow
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
            shadow-camera-left={-half} shadow-camera-right={half} shadow-camera-top={half} shadow-camera-bottom={-half} />
          <group position={[-width / 2, 0, -depth / 2]}>
            {shown.map(s => {
              const roomItems = placedItems.filter(i => i.roomId === s.id);
              const planFurniture = rooms.find(r => r.id === s.id)?.furniture ?? [];
              return (
                <Room
                  key={s.id}
                  s={s}
                  planFurniture={planFurniture}
                  onRemoveFurniture={interactMode === "hand" && cat ? onRemoveFurniture : undefined}
                  onRotateFurniture={interactMode === "hand" && cat ? onRotateFurniture : undefined}
                  furnitureDrag={interactMode === "hand" && !!cat}
                  onMoveFurniture={interactMode === "hand" && cat ? onMoveFurniture : undefined}
                  onClick={c => {
                    if (!cat) { pick(s.id); return; }
                    if (interactMode !== "point") return;
                    setClick({ ...c, at: Date.now() });
                  }}
                >
                  {stains?.length && s.id === shown[0]?.id ? <StainDecals scene={s} stains={stains} /> : null}
                  {roomItems.map(item => (
                    <ItemBoundary key={item.key} fallback={<ItemBox item={item} />} onError={() => onItemError?.(item.key)}>
                      <Suspense fallback={null}>
                        <PlacedItemModel
                          item={item} room={s}
                          dragEnabled={interactMode === "hand"}
                          onMove={onMoveItem}
                          onRotate={interactMode === "hand" ? onRotateItem : undefined}
                          onRemove={onRemoveItem}
                        />
                      </Suspense>
                    </ItemBoundary>
                  ))}
                  {cat && <CatActor key={`${s.id}:${cat.albedoUrl}`} s={s} look={cat} click={catClick} pos={catPos} extraObs={itemObstacles(roomItems.filter(i => !passableItem(story, i.name)))} forceClip={catClip} speed={catSpeed} story={story} items={roomItems} onStory={onStory} elder={elder} tint={light ? catTint : null} />}
                </Room>
              );
            })}
          </group>
          <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.1} minDistance={cat ? 0.8 : 1.5} maxDistance={cat ? Math.max(cam.dist * 3, 12) : cam.dist * 2.5} makeDefault />
          <CameraRig position={cam.position} view={view} />
          {cat && <FollowCat pos={catPos} />}
          {cat && shot && <ShotRig shot={shot} />}
          {onFloorDrop && <FloorRayBridge api={floorRay} />}
          {capture && <SceneGrab />}
        </Canvas>
      </div>
    </div>
  );
}
