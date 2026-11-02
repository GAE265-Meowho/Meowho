// 物品的剛體模擬：地板與家具是固定碰撞體，可推的小物是剛體。座標用地板座標（公尺）：x 沿 e1、y 朝上、z 沿 e2
// 材質參數與碰撞判斷參考 wesbos/3d-model-anything packages/room-physics（MIT，見同資料夾 CREDITS.txt）
import * as THREE from "three";

const STEP = 1 / 60;
const MAX_STEPS = 4;      // 畫面落後時最多補幾步，分頁隱藏回來不會卡住
const IMPACT_MIN = 0.6;   // 公尺/秒，撞擊速度低於這個不出聲
const IMPACT_FULL = 4;    // 公尺/秒，到這個速度算最大聲
const IMPACT_GAP = 15;    // 同一物品連續撞擊至少隔幾步
const ROLL_DAMPING = 1.2; // Rapier 沒有滾動阻力，靠旋轉阻尼讓杯子滾一下就停
const CAT_RADIUS = 0.07;  // 貓身體的膠囊體（公尺）
const CAT_HALF = 0.13;

export const SURFACES = {
  rubber: { friction: 0.9, restitution: 0.72, damping: 0.05 },
  soft: { friction: 1.0, restitution: 0.02, damping: 0.6 },
  wood: { friction: 0.55, restitution: 0.2, damping: 0.05 },
  metal: { friction: 0.4, restitution: 0.15, damping: 0.05 },
  plastic: { friction: 0.5, restitution: 0.3, damping: 0.05 },
  glass: { friction: 0.35, restitution: 0.25, damping: 0.05 },
  cardboard: { friction: 0.7, restitution: 0.08, damping: 0.1 },
  stone: { friction: 0.6, restitution: 0.1, damping: 0.05 },
};

export class RoomPhysics {
  async load(frame) {
    this.R = (await import("@dimforge/rapier3d-compat")).default;
    await this.R.init();
    this.world = new this.R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.upm = frame.units_per_meter;
    this.origin = new THREE.Vector3(...frame.origin);
    this.basis = new THREE.Matrix4().makeBasis(...["e1", "up", "e2"].map((k) => new THREE.Vector3(...frame[k])));
    this.left = 0;
    this.stepsTaken = 0;
    this.events = new this.R.EventQueue(true);
    this.items = [];
    this.byCollider = new Map();   // 碰撞體 → 物品
    this.surfaces = new Map();     // 碰撞體 → 材質
    this.onImpact = null;          // (item, 0~1 的強度, 撞到的材質)
    this.addCuboid([0, -0.5, 0], [50, 0.5, 50], 0, "wood");  // 地板
    this.addCat();
    return this;
  }

  addCuboid(center, half, yaw, surface = "plastic") {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    const s = SURFACES[surface] || SURFACES.plastic;
    const c = this.world.createCollider(this.R.ColliderDesc.cuboid(...half)
      .setTranslation(...center).setRotation(q).setFriction(s.friction).setRestitution(s.restitution));
    this.surfaces.set(c.handle, surface);
  }

  // 貓的身體：平躺的膠囊體，位置由貓決定，走路時碰到小物會把它推開
  addCat() {
    this.cat = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased());
    this.catCollider = this.world.createCollider(this.R.ColliderDesc.capsule(CAT_HALF, CAT_RADIUS).setFriction(0.6), this.cat);
    this.catCollider.setEnabled(false);
    this.surfaces.set(this.catCollider.handle, "soft");
    this.catTo = null;
  }

  // x, y, z 是貓腳底的位置（公尺），heading 是面向。solid 為 false 時（跳躍中、站在家具上、隱藏）不碰撞
  moveCat(x, y, z, heading, solid) {
    const to = { x, y: y + CAT_RADIUS + 0.04, z };
    if (solid && !this.catCollider.isEnabled()) this.cat.setTranslation(to, true);  // 瞬移，不能帶速度撞到東西
    this.catCollider.setEnabled(solid);
    this.catTo = solid ? to : null;
    if (!solid) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    this.cat.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }

  addFixed(o) {
    const [w, h, d] = o.box.size;
    this.addCuboid(o.box.center, [w / 2, h / 2, d / 2], o.box.yaw, o.physics.surface);
  }

  // 四面牆，物品滑到牆邊會停下
  addRoom({ min: [x0, z0], max: [x1, z1] }) {
    const [cx, cz, hx, hz] = [(x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2];
    for (const [c, h] of [
      [[x0 - 0.2, 1, cz], [0.2, 1, hz + 0.4]], [[x1 + 0.2, 1, cz], [0.2, 1, hz + 0.4]],
      [[cx, 1, z0 - 0.2], [hx + 0.4, 1, 0.2]], [[cx, 1, z1 + 0.2], [hx + 0.4, 1, 0.2]],
    ]) this.addCuboid(c, h, 0);
  }

  // 碰撞形狀用高斯點算出的凸包；沒有時退回圓柱（杯子）或方塊
  addBody(o) {
    const [w, h, d] = o.box.size;
    const s = SURFACES[o.physics.surface] || SURFACES.plastic;
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.dynamic()
      .setTranslation(...o.box.center).setLinearDamping(0.1 + s.damping).setAngularDamping(ROLL_DAMPING + s.damping).setCcdEnabled(true));
    const hull = o.physics.hull && this.R.ColliderDesc.convexHull(new Float32Array(o.physics.hull.flat()));
    const shape = hull || (o.label === "cup" ? this.R.ColliderDesc.cylinder(h / 2, Math.min(w, d) / 2)
                                             : this.R.ColliderDesc.cuboid(w / 2, h / 2, d / 2));
    const collider = this.world.createCollider(shape.setMass(o.physics.mass_kg)
      .setFriction(s.friction).setRestitution(s.restitution)
      .setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS), body);
    body.sleep();  // 外框底部常離地一點，被碰到才開始模擬
    const item = { body, home: o.box.center, height: h, surface: o.physics.surface, size: Math.max(w, h, d),
                   lastHit: -Infinity, velocity: { x: 0, y: 0, z: 0 } };
    this.items.push(item);
    this.byCollider.set(collider.handle, item);
    this.surfaces.set(collider.handle, o.physics.surface);
    return item;
  }

  // 在物體中心上方 lift 公尺處施力，杯子會翻倒而不是平移
  push(item, dir, impulse, lift) {
    const p = item.body.translation();
    item.body.applyImpulseAtPoint({ x: dir.x * impulse, y: 0, z: dir.y * impulse }, { x: p.x, y: p.y + lift, z: p.z }, true);
  }

  reset(item) {
    const [x, y, z] = item.home;
    item.body.setTranslation({ x, y, z }, true);
    item.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    item.body.sleep();
  }

  step(dt) {
    this.left += dt;
    let steps = 0;
    const count = Math.min(Math.floor(this.left / STEP), MAX_STEPS);
    const from = this.cat.translation();
    while (this.left >= STEP && steps < MAX_STEPS) {
      for (const it of this.items) it.velocity = it.body.linvel();  // 撞擊後速度就變了，要用撞擊前的
      if (this.catTo) {  // 一幀的位移平均分到每一步，畫面卡頓時貓才不會用高速撞物品
        const k = (steps + 1) / count, t = this.catTo;
        this.cat.setNextKinematicTranslation({ x: from.x + (t.x - from.x) * k, y: from.y + (t.y - from.y) * k, z: from.z + (t.z - from.z) * k });
      }
      this.world.step(this.events);
      this.stepsTaken++;
      this.events.drainCollisionEvents((a, b, started) => { if (started) this.impact(a, b); });
      for (const it of this.items) if (it.body.translation().y < -1) this.reset(it);  // 穿出房間就放回原位
      this.left -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.left = 0;
  }

  impact(a, b) {
    const it = this.byCollider.get(a) || this.byCollider.get(b);
    if (!it || !this.onImpact) return;
    const other = this.byCollider.get(a) === it ? b : a;
    const v = it.velocity, speed = Math.hypot(v.x, v.y, v.z);
    if (speed < IMPACT_MIN || this.stepsTaken - it.lastHit < IMPACT_GAP) return;
    it.lastHit = this.stepsTaken;
    this.onImpact(it, Math.min(1, speed / IMPACT_FULL), this.surfaces.get(other));
  }

  // 把剛體姿態套到 splat 場景上；splat 的原點在物品底部中心
  sync(item, scene) {
    const t = item.body.translation(), r = item.body.rotation();
    const rot = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    const world = this.basis.clone().multiply(rot).multiply(this.basis.clone().invert());
    scene.quaternion.setFromRotationMatrix(world);
    const base = new THREE.Vector3(0, -item.height / 2, 0).applyMatrix4(rot);
    scene.position.set(t.x + base.x, t.y + base.y, t.z + base.z).applyMatrix4(this.basis)
      .multiplyScalar(this.upm).add(this.origin);
  }
}
