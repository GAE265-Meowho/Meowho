// 房間裡會走動的貓：讀 room_layout.py 輸出的地板網格，閒晃、繞開障礙、走到點擊位置
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mainRegion } from "./regions";

const CAT_HEIGHT_M = 0.3;   // 站著時頭頂離地的高度
const WALK_SPEED_M = 0.35;  // 公尺/秒
const TURN_SPEED = 4;       // 弧度/秒
const JUMP_CROUCH = 0.27;   // 秒，jump_start 的長度，蹲下蓄力時貓不移動
const JUMP_AIR = 0.7;       // 秒，騰空時間
const JUMP_LAND = 0.6;      // 秒，落地後停一下再回到待機
const JUMP_ARC_M = 0.2;     // 拋物線比直線高多少
const PAW_HIT = 0.22;       // 秒，撲出去多久後碰到物品
const PAW_END = 0.8;        // 秒，撲完回到待機
const SPRINT_SPEED_M = 1.9;  // 公尺/秒，追玩具時衝刺
const RUN_SPEED_M = 0.8;    // 搖桿推到底時的速度
const WALL_GAP_M = 0.12;    // 搖桿控制時離牆多遠
const RUN_AT = 0.8;         // 搖桿推多遠開始跑
const DRIVE_REST = 3;       // 放開搖桿後幾秒恢復閒晃
const AUTO_MIN = 30;        // 自己找事做的間隔（秒）
const AUTO_MAX = 60;
const PLAY_NEAR_M = 0.12;   // 拍物品時離物品的距離範圍
const PLAY_FAR_M = 0.4;
const LAND_INSET_M = 0.3;   // 落點離家具邊緣多遠
const MODEL_YAW = 0;        // 模型本身面向 +Z；若走路方向不對再調這個

export class RoomCat {
  constructor(layout) {
    this.L = layout;
    this.upm = layout.units_per_meter;
    this.walkable = Uint8Array.from(layout.walkable, (c) => c === "1");
    // 上方沒被桌面擋住的格子；舊版 layout 沒有這欄就當全部開放
    this.open = layout.open ? Uint8Array.from(layout.open, (c) => c === "1") : this.walkable;
    this.topM = layout.top_cm ? layout.top_cm.map((c) => c / 100) : null;  // 每格東西頂端高度
    this.cells = mainRegion(this.walkable, this.L.nx);  // 只在最大那塊相連地板出生、閒晃

    // 本地座標系：x 沿 e1、y 沿上方向、z 沿 e2，原點在地板網格角落
    const [e1, up, e2, o] = ["e1", "up", "e2", "origin"].map((k) => new THREE.Vector3(...layout[k]));
    this.frame = new THREE.Group();
    this.frame.matrixAutoUpdate = false;
    this.frame.matrix.makeBasis(e1, up, e2).setPosition(o);
    this.frame.updateMatrixWorld(true);
    this.floor = new THREE.Plane().setFromNormalAndCoplanarPoint(up, o);

    this.cat = new THREE.Group();   // 平移/轉向用；模型掛在下面
    this.frame.add(this.cat);
    this.lights = [new THREE.HemisphereLight(0xffffff, 0x404040, 2.2), new THREE.DirectionalLight(0xffffff, 1.5)];
    this.lights[1].position.copy(up).multiplyScalar(10).add(e1);

    this.path = [];
    this.surface = null;  // 正站在哪個家具上；null 表示在地板
    this.jump = null;     // 跳躍中的 { from, to, t, phase, then }
    this.arrive = null;   // 走到目的地後要做的事
    this.queued = null;   // 落地後才走的目的地
    this.stick = null;    // 搖桿輸入 { dir（本地 x,z，單位向量）, mag（0~1）}
    this.sprint = false;  // 追玩具時衝刺（跑步動作、較快的速度與轉身）
    this.autoIn = AUTO_MIN;
    this.onBored = null;  // 閒晃時想找事做就呼叫，回傳 true 表示開始做了
    /** @type {{ min: number[], max: number[] } | null} */
    this.room = null;     // 房間範圍，搖桿控制時當牆
    this.state = "idle";
    this.timer = 1;
    this.heading = 0;
    this.mixer = null;
    this.actions = {};
  }

  // albedoUrl：這隻貓已確認的貼圖（虛擬體驗選的貓）；沒給或載入失敗就用母體預設花色
  async load(url, albedoUrl) {
    const [gltf, albedo] = await Promise.all([
      new GLTFLoader().loadAsync(url),
      albedoUrl ? new THREE.TextureLoader().loadAsync(albedoUrl).catch(() => null) : null,
    ]);
    if (albedo) { albedo.flipY = false; albedo.colorSpace = THREE.SRGBColorSpace; }  // 同 CatPreview
    const model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;  // 骨架動畫的包圍盒不準，避免貓被裁掉
      o.material.metalness = 0; // 檔案沒寫金屬度時預設是 1，沒有環境貼圖會變全黑
      if (albedo && o.material.name === "cat_fur") { o.material.map = albedo; o.material.needsUpdate = true; }
    });
    model.rotation.y = MODEL_YAW;
    this.cat.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    // 片段名稱是 rig|rig|walk，取最後一段：idle、walk、run、jump_start、jump、jump_fall、jump_end
    for (const clip of gltf.animations) this.actions[clip.name.split("|").pop()] = this.mixer.clipAction(clip);
    this.actions.idle?.play();
    this.current = this.actions.idle;

    // 綁定姿勢和站姿差很多，比例和腳的高度要用播放中的待機姿勢量（尾巴不算）
    this.mixer.update(0);
    model.updateMatrixWorld(true);
    const ys = [];
    model.traverse((o) => { if (o.isBone && !/tail/.test(o.name)) ys.push(model.worldToLocal(o.getWorldPosition(new THREE.Vector3())).y); });
    const top = Math.max(...ys), feet = Math.min(...ys);
    const s = (CAT_HEIGHT_M * this.upm) / (top - feet);
    model.scale.setScalar(s);
    model.position.y = -feet * s;

    this.place(this.randomCell());
    return this;
  }

  addTo(scene) {
    scene.add(this.frame, ...this.lights);
  }

  set visible(v) { this.frame.visible = v; this.lights.forEach((l) => (l.visible = v)); }
  get visible() { return this.frame.visible; }

  // ---------- 網格工具 ----------
  idx(i, j) { return j * this.L.nx + i; }
  isFree(i, j) { return i >= 0 && j >= 0 && i < this.L.nx && j < this.L.ny && this.walkable[this.idx(i, j)] === 1; }
  cellOf(x, z) { return [Math.floor(x / this.L.cell), Math.floor(z / this.L.cell)]; }
  centerOf(k) {
    const i = k % this.L.nx, j = Math.floor(k / this.L.nx);
    return new THREE.Vector2((i + 0.5) * this.L.cell, (j + 0.5) * this.L.cell);
  }
  randomCell() { return this.cells[Math.floor(Math.random() * this.cells.length)]; }

  nearestFree(x, z, maxR = 6) {
    const [ci, cj] = this.cellOf(x, z);
    for (let r = 0; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) === r && this.isFree(ci + di, cj + dj)) return this.idx(ci + di, cj + dj);
      }
    }
    return -1;
  }

  place(k) {
    const p = this.centerOf(k);
    this.cat.position.set(p.x, 0, p.y);
  }

  /** 走不過去時直接出現在格子 k，面向 face 待一會（同走到後的樣子） @param {number} k @param {THREE.Vector2 | null} [face] */
  appearAt(k, face = null) {
    this.jump = null;
    this.surface = null;
    this.path = [];
    this.arrive = this.queued = null;
    this.place(k);
    this.dest = this.centerOf(k);
    this.face = face;
    this.setState("idle");
    if (face) this.timer = 6;
  }

  // BFS（8 方向、不切牆角）找路，再用視線檢查把鋸齒路徑拉直
  findPath(from, to) {
    const { nx } = this.L;
    const prev = new Int32Array(this.walkable.length).fill(-1);
    prev[from] = from;
    const q = [from];
    for (let h = 0; h < q.length && prev[to] < 0; h++) {
      const k = q[h], i = k % nx, j = (k - i) / nx;
      for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const a = i + di, b = j + dj;
        if (!this.isFree(a, b) || (di && dj && !(this.isFree(i + di, j) && this.isFree(i, j + dj)))) continue;
        const n = this.idx(a, b);
        if (prev[n] < 0) { prev[n] = k; q.push(n); }
      }
    }
    if (prev[to] < 0) return null;
    const cells = [];
    for (let k = to; k !== from; k = prev[k]) cells.push(k);
    const pts = cells.reverse().map((k) => this.centerOf(k));
    const out = [];
    let a = new THREE.Vector2(this.cat.position.x, this.cat.position.z);
    for (let n = 0; n < pts.length; n++) {
      if (n === pts.length - 1 || !this.lineOfSight(a, pts[n + 1])) { out.push(pts[n]); a = pts[n]; }
    }
    return out;
  }

  lineOfSight(a, b) {
    const steps = Math.ceil(a.distanceTo(b) / (this.L.cell / 3));
    for (let s = 1; s < steps; s++) {
      const p = a.clone().lerp(b, s / steps);
      if (!this.isFree(...this.cellOf(p.x, p.y))) return false;
    }
    return true;
  }

  // 從鏡頭看向格子 k（貓身高度）的視線，有沒有被沿途比視線還高的東西（桌子、隔板）擋住
  visibleFrom(eyeLocal, k) {
    if (!this.topM) return true;
    const c = this.centerOf(k);
    const a = new THREE.Vector3(eyeLocal.x, eyeLocal.y, eyeLocal.z);
    const b = new THREE.Vector3(c.x, 0.15 * this.upm, c.y);
    const horiz = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(horiz / (this.L.cell / 2));
    for (let s = 1; s < steps; s++) {
      const p = a.clone().lerp(b, s / steps);
      if (Math.hypot(p.x - b.x, p.z - b.z) < 0.25 * this.upm) break;  // 貓自己旁邊那圈不算
      const [i, j] = this.cellOf(p.x, p.z);
      if (i < 0 || j < 0 || i >= this.L.nx || j >= this.L.ny) continue;
      if (p.y / this.upm < this.topM[this.idx(i, j)] - 0.03) return false;
    }
    return true;
  }

  currentCell() {
    const k = this.nearestFree(this.cat.position.x, this.cat.position.z);
    return k < 0 ? this.randomCell() : k;
  }

  /** @param {number} k 目的地格子 @param {THREE.Vector2 | null} [face] 走到後要轉頭看的點（本地 x,z） */
  goTo(k, face = null) {
    if (this.jump || this.surface) {  // 先下來再走
      this.queued = () => this.goTo(k, face);
      if (!this.jump) this.jumpDown();
      return true;
    }
    const path = this.findPath(this.currentCell(), k);
    if (!path?.length) return false;
    this.arrive = null;
    this.path = path;
    this.dest = this.centerOf(k);
    this.face = face;  // 走到後要轉頭看的點（本地 x,z），沒有就照常閒晃
    this.setState("walk");
    return true;
  }

  // 物品（segment_objects.py 的 floor_pos_m / size_m）佔的格子設成不能走
  addObstacles(objects) {
    const c = this.L.cell;
    for (const o of objects) {
      if (o.floor_pos_m[1] > 0.15) continue;  // 桌上的杯子、掛著的毛巾：底下地板照樣能走
      if (o.splat) continue;  // 拆開的小物由物理處理，貓走過去會推開
      const [x, , z] = o.floor_pos_m.map((v) => v * this.upm);
      const hw = (o.size_m[0] / 2) * this.upm, hd = (o.size_m[2] / 2) * this.upm;
      for (let j = Math.floor((z - hd) / c); j <= Math.floor((z + hd) / c); j++)
        for (let i = Math.floor((x - hw) / c); i <= Math.floor((x + hw) / c); i++)
          if (i >= 0 && j >= 0 && i < this.L.nx && j < this.L.ny) {
            // 能躲的家具（書桌）底下可以走，只是不算開闊處
            if (o.affordance?.hide_under) this.open[this.idx(i, j)] = 0;
            else this.walkable[this.idx(i, j)] = 0;
          }
    }
    this.cells = mainRegion(this.walkable, this.L.nx);  // 只在最大那塊相連地板出生、閒晃
  }

  // 虛擬用品（外出籠、碗、貓砂盆）佔的格子（j * nx + i）設成不能走；換清單時先還原成房間原本的樣子
  blockCells(indices) {
    this.baseWalkable ??= Uint8Array.from(this.walkable);
    this.walkable.set(this.baseWalkable);
    for (const k of indices) this.walkable[k] = 0;
    this.cells = mainRegion(this.walkable, this.L.nx);  // 只在最大那塊相連地板出生、閒晃
  }

  // 可走的格子裡，依 dist（到物品的距離）挑 lo~hi 之間的，鏡頭看得到的優先，其次離貓近
  spotsNear(dist, lo, hi, camera) {
    const me = new THREE.Vector2(this.cat.position.x, this.cat.position.z);
    const eye = camera && this.frame.worldToLocal(camera.position.clone());
    const v = new THREE.Vector3();
    const offScreen = (k) => {  // 貓身高度投影到畫面外
      const c = this.centerOf(k);
      this.frame.localToWorld(v.set(c.x, 0.15 * this.upm, c.y)).project(camera);
      return v.z > 1 || Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9;
    };
    return this.cells
      .map((k) => ({ k, d: dist(this.centerOf(k)) }))
      .filter(({ d }) => d > lo && d < hi)
      .map(({ k }) => ({ k, s: this.centerOf(k).distanceTo(me) + (this.open[k] ? 0 : this.upm)
                              + (camera && (offScreen(k) || !this.visibleFrom(eye, k)) ? 3 * this.upm : 0) }))
      .sort((a, b) => a.s - b.s)
      .slice(0, 12);
  }

  // 走到物品旁邊（離物品邊緣 10~45 公分的空格），到了轉頭看著它
  visit(o, camera = null) {
    const center = new THREE.Vector2(o.floor_pos_m[0], o.floor_pos_m[2]).multiplyScalar(this.upm);
    const r = (Math.max(o.size_m[0], o.size_m[2]) / 2) * this.upm;
    const cands = this.spotsNear((p) => p.distanceTo(center), r + 0.1 * this.upm, r + 0.45 * this.upm, camera);
    for (const { k } of cands) if (this.goTo(k, center)) return true;
    return false;
  }

  // 走到家具邊，跳到家具表面上。top 是表面高度（公尺）；spot 是指定的落點（本地 x,z），done 在落地後呼叫
  /**
   * @param {any} o
   * @param {number} top
   * @param {THREE.Camera | null} [camera]
   * @param {THREE.Vector2 | null} [spot]
   * @param {(() => void) | null} [done]
   */
  jumpOn(o, top, camera = null, spot = null, done = null) {
    if (this.surface === o) { done?.(); return true; }
    const center = new THREE.Vector2(o.floor_pos_m[0], o.floor_pos_m[2]).multiplyScalar(this.upm);
    const hw = (o.size_m[0] / 2) * this.upm, hd = (o.size_m[2] / 2) * this.upm;
    const edge = (p) => Math.hypot(Math.max(Math.abs(p.x - center.x) - hw, 0), Math.max(Math.abs(p.y - center.y) - hd, 0));
    const inset = LAND_INSET_M * this.upm;
    const go = () => {
      for (const { k } of this.spotsNear(edge, 0.05 * this.upm, 0.4 * this.upm, camera)) {
        if (!this.goTo(k, center)) continue;
        const p = this.centerOf(k);
        const land = new THREE.Vector3(
          spot ? spot.x : THREE.MathUtils.clamp(p.x, center.x - hw + inset, center.x + hw - inset), top * this.upm,
          spot ? spot.y : THREE.MathUtils.clamp(p.y, center.y - hd + inset, center.y + hd - inset));
        this.arrive = () => this.startJump(land, () => {
          this.surface = o;
          this.surfaceRect = { x: center.x, z: center.y, hw: Math.max(hw - inset / 3, 0), hd: Math.max(hd - inset / 3, 0) };
          this.timer = 10 + Math.random() * 8;
          done?.();
        });
        return true;
      }
      return false;
    };
    if (this.jump || this.surface) {
      this.queued = go;
      if (!this.jump) this.jumpDown();
      return true;
    }
    return go();
  }

  // 地板網格會延伸到牆外一點，搖桿控制時再用房間範圍擋住
  canStand(x, z) {
    if (!this.isFree(...this.cellOf(x, z))) return false;
    if (!this.room) return true;
    const m = WALL_GAP_M * this.upm, { min, max } = this.room;
    return x > min[0] * this.upm + m && x < max[0] * this.upm - m && z > min[1] * this.upm + m && z < max[1] * this.upm - m;
  }

  // 搖桿輸入；mag 太小當成放開
  setStick(dir, mag) { this.stick = mag > 0.1 ? { dir, mag } : null; }

  // 搖桿控制：在地板上被牆和家具擋住（可沿牆滑動），在家具上不會走出邊緣
  updateDrive(dt) {
    const { dir, mag } = this.stick;
    this.turnToward(dir, dt);
    const run = mag > RUN_AT;
    this.playClip(run ? "run" : "walk", false, 0.2);
    if (this.actions.walk) this.actions.walk.timeScale = 1;
    const step = (run ? RUN_SPEED_M : WALK_SPEED_M) * mag * this.upm * dt;
    const p = this.cat.position;
    const x = p.x + dir.x * step, z = p.z + dir.y * step;
    if (this.surface) {
      const r = this.surfaceRect;
      p.x = THREE.MathUtils.clamp(x, r.x - r.hw, r.x + r.hw);
      p.z = THREE.MathUtils.clamp(z, r.z - r.hd, r.z + r.hd);
      return;
    }
    if (this.canStand(x, p.z)) p.x = x;
    if (this.canStand(p.x, z)) p.z = z;
  }

  // 目前的位置（貓身高度）的世界座標，給跟隨鏡頭用
  bodyWorld() {
    return this.frame.localToWorld(this.cat.position.clone().setY(this.cat.position.y + 0.15 * this.upm));
  }

  // 跳回最近的空地板
  jumpDown() {
    const k = this.nearestFree(this.cat.position.x, this.cat.position.z, 15);
    if (k < 0) return false;
    const p = this.centerOf(k);
    this.startJump(new THREE.Vector3(p.x, 0, p.y), () => { this.surface = null; });
    return true;
  }

  // 轉向 target（本地 x,z）後撲一下，onHit 在碰到的瞬間呼叫。模型沒有撥弄動畫，先用起跳的前撲動作代替
  paw(target, onHit, done = null) {
    this.pawing = { target, onHit, done, t: 0 };
    this.state = "paw";
    this.face = null;
    this.playClip("idle", false, 0.1);
  }

  updatePaw(dt) {
    const p = this.pawing;
    if (p.t === 0 || !p.lunged) {
      const diff = this.turnToward(p.target.clone().sub(new THREE.Vector2(this.cat.position.x, this.cat.position.z)), dt);
      if (Math.abs(diff) > 0.1) return;
      p.lunged = true;
      this.playClip("jump_start", true);
    }
    p.t += dt;
    if (p.onHit && p.t >= PAW_HIT) { p.onHit(); p.onHit = null; }
    if (p.t >= PAW_END) {
      this.pawing = null;
      this.setState("idle");
      this.timer = 8;
      p.done?.();
    }
  }

  // 追著物品連續拍 rounds 下。where() 回傳物品現在的位置（本地 x,z），hit(貓的位置) 施力
  playWith(where, hit, rounds, camera = null) {
    const lo = PLAY_NEAR_M * this.upm, hi = PLAY_FAR_M * this.upm;
    const pat = () => {
      const me = new THREE.Vector2(this.cat.position.x, this.cat.position.z);
      const next = () => { if (--rounds > 0) this.playWith(where, hit, rounds, camera); };
      this.paw(where(), () => hit(me), next);
    };
    const p = where();
    const d = p.distanceTo(new THREE.Vector2(this.cat.position.x, this.cat.position.z));
    if (!this.surface && d >= lo && d <= hi) { pat(); return true; }
    for (const { k } of this.spotsNear((c) => c.distanceTo(p), lo, hi, camera)) {
      if (!this.goTo(k, p)) continue;
      if (this.surface || this.jump) this.queued = () => this.playWith(where, hit, rounds, camera);
      else this.arrive = pat;
      return true;
    }
    return false;
  }

  startJump(to, then) {
    this.jump = { from: this.cat.position.clone(), to, t: 0, phase: "crouch", then };
    this.state = "jump";
    this.face = null;
    this.playClip("jump_start", true);
  }

  // ---------- 對外操作 ----------

  // 點擊畫面：射線打到地板平面就走過去
  walkToScreen(ndc, camera) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(this.floor, new THREE.Vector3());
    if (!hit) return false;
    const local = this.frame.worldToLocal(hit);
    const k = this.nearestFree(local.x, local.z);
    return k >= 0 && this.goTo(k);
  }

  // 叫到看得到的地板上：在可走的格子裡挑「落在畫面中下方、0.6~3.5 公尺內、上方沒有桌子」最理想的一格
  comeTo(camera) {
    const v = new THREE.Vector3();
    const eye = this.frame.worldToLocal(camera.position.clone());
    let best = -1, bestScore = Infinity;
    for (const k of this.cells) {
      const c = this.centerOf(k);
      this.frame.localToWorld(v.set(c.x, 0.15 * this.upm, c.y));
      const d = v.distanceTo(camera.position) / this.upm;
      if (d < 0.6 || d > 3.5) continue;
      v.project(camera);
      if (v.z > 1 || Math.abs(v.x) > 0.8 || v.y < -0.85 || v.y > 0.4) continue;
      let score = v.x * v.x + (v.y + 0.35) ** 2 + 0.02 * d + (this.open[k] ? 0 : 2);  // 桌子底下看不到，盡量避開
      if (score >= bestScore) continue;
      if (!this.visibleFrom(eye, k)) score += 3;  // 視線被擋住
      if (score < bestScore) { bestScore = score; best = k; }
    }
    if (best >= 0 && this.goTo(best)) return true;
    // 畫面裡沒有可走的地板：退而求其次，走到鏡頭前約 1 公尺的地板
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const p = camera.position.clone().addScaledVector(fwd, this.upm);
    const local = this.frame.worldToLocal(this.floor.projectPoint(p, new THREE.Vector3()));
    const k = this.nearestFree(local.x, local.z, 15);
    return k >= 0 && this.goTo(k);
  }

  // 目的地（貓身高度）的世界座標，給檢視器轉頭用
  destWorld() {
    return this.dest && this.frame.localToWorld(new THREE.Vector3(this.dest.x, 0.15 * this.upm, this.dest.y));
  }

  // ---------- 每幀更新 ----------

  playClip(name, once = false, fade = 0.1) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.reset().fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
  }

  setState(s) {
    this.state = s;
    this.playClip(s === "walk" ? "walk" : "idle", false, 0.25);
    if (s === "idle") this.timer = 2 + Math.random() * 5;
  }

  // 往 dir（本地 x,z）轉，回傳轉之前的角度差
  turnToward(dir, dt) {
    let diff = Math.atan2(dir.x, dir.y) - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * (this.sprint ? 3 : 1) * dt);
    this.cat.rotation.y = this.heading;
    return diff;
  }

  // 蹲下（jump_start）→ 騰空（jump_fall 是伸展的固定姿勢）→ 落地（jump_end）
  updateJump(dt) {
    const j = this.jump;
    j.t += dt;
    if (j.phase === "crouch") {
      this.turnToward(new THREE.Vector2(j.to.x - j.from.x, j.to.z - j.from.z), dt);
      if (j.t >= JUMP_CROUCH) { j.phase = "air"; j.t = 0; this.playClip("jump_fall", false, 0.08); }
    } else if (j.phase === "air") {
      const s = Math.min(j.t / JUMP_AIR, 1);
      this.cat.position.lerpVectors(j.from, j.to, s);
      this.cat.position.y += 4 * s * (1 - s) * JUMP_ARC_M * this.upm;
      if (s === 1) { j.phase = "land"; j.t = 0; this.playClip("jump_end", true, 0.08); }
    } else if (j.t >= JUMP_LAND) {
      this.jump = null;
      this.setState("idle");
      j.then();
      const q = this.queued;
      this.queued = null;
      q?.();
    }
  }

  update(dt) {
    if (!this.mixer || !this.visible) return;
    this.mixer.update(dt);

    if (this.state === "jump") { this.updateJump(dt); return; }
    if (this.state === "paw") { this.updatePaw(dt); return; }
    if (this.stick) {
      this.path = [];
      this.arrive = this.queued = this.face = null;
      this.state = "drive";
      this.updateDrive(dt);
      return;
    }
    if (this.state === "drive") {
      this.setState("idle");
      this.timer = DRIVE_REST;
    }

    if (this.state === "idle") {
      this.autoIn -= dt;
      if (this.face) this.turnToward(this.face.clone().sub(new THREE.Vector2(this.cat.position.x, this.cat.position.z)), dt);
      this.timer -= dt;
      if (this.timer <= 0) {
        this.face = null;
        if (this.surface) { this.jumpDown(); return; }
        if (this.autoIn <= 0) {
          this.autoIn = AUTO_MIN + Math.random() * (AUTO_MAX - AUTO_MIN);
          if (this.onBored?.()) return;
        }
        // 閒晃：挑 0.6~3 公尺外的隨機格子
        for (let tries = 0; tries < 20; tries++) {
          const k = this.randomCell();
          const d = this.centerOf(k).distanceTo(new THREE.Vector2(this.cat.position.x, this.cat.position.z)) / this.upm;
          if (d > 0.6 && d < 3 && this.goTo(k)) return;
        }
        this.timer = 1;
      }
      return;
    }

    const target = this.path[0];
    const pos = new THREE.Vector2(this.cat.position.x, this.cat.position.z);
    const to = target.clone().sub(pos);
    const dist = to.length();
    if (dist < 0.05 * this.upm) {
      this.path.shift();
      if (!this.path.length) {
        this.setState("idle");
        if (this.face) this.timer = 6;  // 在物品旁多待一會
        const go = this.arrive;
        this.arrive = null;
        go?.();
      }
      return;
    }

    // 先轉向再走：角度差大時放慢，像貓在原地轉身
    const diff = this.turnToward(to, dt);

    const base = this.sprint ? SPRINT_SPEED_M : WALK_SPEED_M;
    const speed = base * this.upm * Math.max(0.15, Math.cos(Math.min(Math.abs(diff), Math.PI / 2)));
    const step = Math.min(dist, speed * dt);
    this.cat.position.x += Math.sin(this.heading) * step;
    this.cat.position.z += Math.cos(this.heading) * step;
    if (this.sprint) {  // 衝刺：跑步動作
      this.playClip("run", false, 0.12);
      if (this.actions.run) this.actions.run.timeScale = 1.2;
    } else if (this.actions.walk) this.actions.walk.timeScale = speed / (WALK_SPEED_M * this.upm);
  }
}
