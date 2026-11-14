// 展示房間的互動（#93）：把貓、物理和音效接到檢視器。cat.js、physics.js、audio.js 來自影片轉 3D 專案，座標都是地板座標（公尺）。
import type { Viewer } from "@mkkellogg/gaussian-splats-3d";
import * as THREE from "three";
import { Impacts } from "./audio";
import { RoomCat } from "./cat";
import { cameraForward, dropTarget, placeObjects, type PlacedObject, type RoomCamera, type RoomLayout, type RoomScene } from "./demo";
import { RoomPhysics } from "./physics";
import { footprintCells } from "@/lib/play/scene-items";
import { CATCH_M, isCaught, type SceneCatCommand } from "@/lib/play/scene-cat";

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
  /** 虛擬飼養：照劇情讓貓躲起來、走到某處、跳上家具（座標是地板座標，公尺） */
  command(cmd: SceneCatCommand): void;
  /** 畫面上的點 → 地板座標（公尺）；沒打到地板回 null */
  floorAt(ndc: THREE.Vector2): [number, number] | null;
  /** 3D 逗貓：貓追著玩具跑、撲；撲到玩具時呼叫 onCatch(是否抓到)。toy 為 null 表示玩具不在場 */
  play(on: ((caught: boolean) => void) | null): void;
  setToy(at: [number, number] | null): void;
  /** 虛擬用品（地板座標，公尺）：貓繞過去、不會穿過 */
  setItems(items: { x: number; z: number; widthM: number; depthM: number }[]): void;
  /** 貓頭頂上方的世界座標（給畫面上的對話框定位）；貓不在畫面時回 false */
  catHead(out: THREE.Vector3): boolean;
  /** 鏡頭原地轉向貓（貓不在場就不動），讓頭頂的對話框和貓一起在畫面裡 */
  lookAtCat(): void;
  /** 貓的節點（移動、轉向用的那層）：虛擬飼養結局把貓換成老貓的毛色與體型（lib/play/elder-cat.ts） */
  catRoot: THREE.Object3D;
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

  // 3D 逗貓：貓閒下來就追玩具，撲的瞬間玩具還在附近才算抓到
  let onPlay: ((caught: boolean) => void) | null = null;
  let toy: [number, number] | null = null;
  const chase = { cool: 0 };

  const catHead = (out: THREE.Vector3) => {
    if (!cat.visible) return false;
    cat.cat.getWorldPosition(out);
    out.addScaledVector(up, 0.3 * upm);
    return true;
  };

  return {
    catHead,
    catRoot: cat.cat,
    hasBed: Boolean(bed),
    hasCup: Boolean(cup),

    update(dt) {
      cat.sprint = Boolean(onPlay && toy);
      if (onPlay && toy && cat.visible) {
        // 3D 逗貓：貓衝刺到玩具旁邊（路徑上的最近空地板），碰得到（30 公分內）才撲；撲的瞬間還碰得到才算抓到
        chase.cool -= dt;
        cat.timer = Math.max(cat.timer, 1);  // 追玩具時不要自己跑去閒晃
        const me = cat.cat.position;
        const dist = Math.hypot(me.x / upm - toy[0], me.z / upm - toy[1]);
        if (cat.state !== "jump" && cat.state !== "paw" && !cat.surface) {
          if (dist <= CATCH_M && cat.state === "idle") {
            if (chase.cool <= 0) {
              cat.paw(new THREE.Vector2(toy[0] * upm, toy[1] * upm), () => {
                const p = cat.cat.position;
                onPlay?.(toy ? isCaught([p.x / upm, p.z / upm], toy) : false);
              });
              chase.cool = 1.2;
            }
          } else if (dist > CATCH_M) {
            const k = cat.nearestFree(toy[0] * upm, toy[1] * upm, 12);
            if (k !== undefined && k >= 0 && (cat.state === "idle" || !cat.dest || cat.dest.distanceTo(cat.centerOf(k)) > 1e-3)) cat.goTo(k);
          }
        }
      }
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

    lookAtCat() {
      const at = new THREE.Vector3();
      if (!catHead(at)) return;
      const pos = viewer.camera.position.clone();
      focus({ pos, look: pos.clone().addScaledVector(at.sub(pos).normalize(), unit * LOOK_AT) });
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

    command(cmd) {
      cat.visible = cmd.kind !== "hidden";
      if (cmd.kind === "go") {
        const k = cat.nearestFree(cmd.x * upm, cmd.z * upm, 12);
        if (k !== undefined && k >= 0) cat.goTo(k);
      } else if (cmd.kind === "jump") {
        const o = objects.find(x => x.id === cmd.object);
        if (o) cat.jumpOn(o, o.surfaces?.[0]?.top_y ?? o.size_m[1], viewer.camera);
      } else if (cmd.kind === "roam" && cat.surface) {
        cat.jumpDown();
      }
      viewer.forceRenderNextFrame();
    },

    floorAt(ndc) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, viewer.camera);
      const hit = ray.ray.intersectPlane(cat.floor, new THREE.Vector3());
      if (!hit) return null;
      const local = cat.frame.worldToLocal(hit);
      return [local.x / upm, local.z / upm];
    },

    play(on) {
      onPlay = on;
      if (!on) cat.sprint = false;
      chase.cool = 0.5;
    },

    setToy(at) {
      toy = at;
    },

    setItems(list) {
      cat.blockCells(list.flatMap(it => footprintCells(layout, it)));
    },

    resetItems() {
      for (const m of movable) { physics.reset(m.item); physics.sync(m.item, m.scene); }
      viewer.forceRenderNextFrame();
    },
  };
}
