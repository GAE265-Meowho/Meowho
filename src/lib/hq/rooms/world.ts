// 展示房間的互動（#93）：把貓、物理和音效接到檢視器。cat.js、physics.js、audio.js 來自影片轉 3D 專案，座標都是地板座標（公尺）。
import type { Viewer } from "@mkkellogg/gaussian-splats-3d";
import * as THREE from "three";
import { Impacts } from "./audio";
import { RoomCat } from "./cat";
import { cameraForward, dropTarget, placeObjects, type PlacedObject, type RoomCamera, type RoomLayout, type RoomScene } from "./demo";
import { RoomPhysics } from "./physics";

const PUSH_IMPULSE = 0.48;  // 牛頓秒，貓撥杯子的力道；0.34 時杯子會停在桌緣
const PAW_REACH_M = 0.22;   // 貓站在杯子後方多遠
const LOOK_AT = 0.01;       // orbit 目標離鏡頭多遠（房間單位）

interface View { pos: THREE.Vector3; look: THREE.Vector3 }
interface PhysicsItem { body: { isSleeping(): boolean } }
interface Movable { ob: PlacedObject; item: PhysicsItem; scene: THREE.Object3D }

export interface RoomWorld {
  hasBed: boolean;
  hasCup: boolean;
  update(dt: number): void;
  walkTo(ndc: THREE.Vector2): void;
  callCat(): void;
  jumpOnBed(): void;
  pushCup(): void;
  resetItems(): void;
}

export async function createRoomWorld({ viewer, threeScene, scene, layout, cameras, catUrl, albedoUrl, unit, focus }: {
  viewer: Viewer;
  threeScene: THREE.Scene;
  scene: RoomScene;
  layout: RoomLayout;
  cameras: RoomCamera[];
  catUrl: string;
  albedoUrl?: string;
  unit: number;
  focus: (view: View) => void;
}): Promise<RoomWorld> {
  const upm = layout.units_per_meter;
  const objects = placeObjects(scene.objects);
  const [e1, up, e2, origin] = (["e1", "up", "e2", "origin"] as const).map(k => new THREE.Vector3(...layout[k]));
  const toWorld = (x: number, y: number, z: number) =>
    origin.clone().addScaledVector(e1, x * upm).addScaledVector(up, y * upm).addScaledVector(e2, z * upm);

  const cat = await new RoomCat(layout).load(catUrl, albedoUrl);
  cat.addTo(threeScene);
  cat.addObstacles(objects);
  cat.room = scene.room;

  const impacts = new Impacts();
  const unlock = () => impacts.unlock();
  addEventListener("pointerdown", unlock, { once: true });

  const physics = await new RoomPhysics().load(scene.frame);
  const splatIds = objects.filter(o => o.splat).map(o => o.name);
  for (const o of objects) if (!splatIds.includes(o.name) && o.floor_pos_m[1] < 0.15) physics.addFixed(o);
  physics.addRoom(scene.room);
  physics.onImpact = (it: { body: { handle: number }; surface: string; size: number }, strength: number, surface?: string) => {
    if (surface === "soft") { impacts.hit(`${it.body.handle}:s`, "soft", strength, it.size); return; }
    impacts.hit(`${it.body.handle}:i`, it.surface, strength, it.size);
    impacts.hit(`${it.body.handle}:f`, surface || "wood", strength * 0.7, it.size);
  };
  const movable: Movable[] = splatIds.map((id, i) => {
    const ob = objects.find(o => o.name === id)!;
    return { ob, item: physics.addBody(ob), scene: viewer.getSplatScene(i + 1) };  // 0 是房間
  });

  const lookFrom = (at: THREE.Vector3, look: THREE.Vector3): View => {
    const near = cameras
      .map(c => {
        const pos = new THREE.Vector3(...c.position);
        const dot = at.clone().sub(pos).normalize().dot(new THREE.Vector3(...cameraForward(c)));
        return { pos, dot, distance: pos.distanceTo(at) };
      })
      .filter(c => c.dot > 0.8)
      .sort((a, b) => a.distance - b.distance)[0];
    return { pos: near ? near.pos.clone().lerp(at, -0.3) : viewer.camera.position.clone(), look };
  };

  const bed = objects.find(o => o.affordance.jump_on && !o.affordance.hide_under && o.surfaces);
  cat.onBored = () => (bed ? cat.jumpOn(bed, bed.surfaces![0].top_y) : false);
  const cup = movable.find(m => m.ob.label === "cup");

  return {
    hasBed: Boolean(bed),
    hasCup: Boolean(cup),

    update(dt) {
      if (cat.visible) {
        cat.update(dt);
        viewer.forceRenderNextFrame();  // 檢視器預設只在相機移動時重畫
      }
      const p = cat.cat.position;
      physics.moveCat(p.x / upm, p.y / upm, p.z / upm, cat.heading, cat.visible && !cat.surface && cat.state !== "jump");
      physics.step(dt);
      for (const m of movable) if (!m.item.body.isSleeping()) physics.sync(m.item, m.scene);
    },

    walkTo(ndc) {
      cat.walkToScreen(ndc, viewer.camera);
    },

    callCat() {
      if (!cat.comeTo(viewer.camera)) return;
      const pos = viewer.camera.position.clone();
      const dest = cat.destWorld();
      if (!dest) return;
      const dir = dest.sub(pos).normalize();  // 只轉頭，確保看得到貓走過來
      focus({ pos, look: pos.clone().addScaledVector(dir, unit * LOOK_AT) });
    },

    jumpOnBed() {
      if (bed) cat.jumpOn(bed, bed.surfaces![0].top_y, viewer.camera);
    },

    pushCup() {
      if (!cup) return;
      const [cx, cy, cz] = cup.ob.floor_pos_m;
      const spots = cameras.map(c => {
        const rel = new THREE.Vector3(...c.position).sub(origin);
        return [rel.dot(e1) / upm, rel.dot(e2) / upm] as [number, number];
      });
      const target = dropTarget([cx, cz], spots);
      if (!target) return;
      const dir = new THREE.Vector2(target[0] - cx, target[1] - cz).normalize();
      const hit = () => physics.push(cup.item, dir, PUSH_IMPULSE, 0.05);
      const desk = objects.find(o => o.affordance.jump_on && o.surfaces
        && Math.abs(o.box.center[0] - cx) < o.box.size[0] / 2 && Math.abs(o.box.center[2] - cz) < o.box.size[2] / 2);
      focus(lookFrom(toWorld(cx, cy, cz), toWorld(cx + dir.x * 0.3, cy * 0.7, cz + dir.y * 0.2)));
      const spot = new THREE.Vector2(cx - dir.x * PAW_REACH_M, cz - dir.y * PAW_REACH_M).multiplyScalar(upm);
      const paw = () => cat.paw(new THREE.Vector2(cx, cz).multiplyScalar(upm), hit);
      if (!(desk && cat.jumpOn(desk, desk.surfaces![0].top_y, viewer.camera, spot, paw))) hit();
    },

    resetItems() {
      for (const m of movable) { physics.reset(m.item); physics.sync(m.item, m.scene); }
      viewer.forceRenderNextFrame();
    },
  };
}
