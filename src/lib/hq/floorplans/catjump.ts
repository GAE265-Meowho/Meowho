// 虛擬體驗（#150，Tina 2026-11-03）：點床、沙發、桌子，貓走到旁邊跳上去；在上面可以走，點地板就跳下來。純函式。
// 座標同 catwalk.ts（一間房的左上角＝原點，公尺）；y 是貓腳底的高度。
// 跳躍用弧線移動；母體還沒有 jump 動作時畫面先用 walk 動作（clips.ts 的 jump 是 planned）。
import { blocked, CAT_RADIUS_M, headingTo, stepCat, stepToward, wanderSpot, type CatState, type Obstacle } from "./catwalk";
import type { RoomScene } from "./scene";

/** 貓跳得上去的最高檯面（公尺） */
export const MAX_JUMP_M = 1.0;
/** 一次跳躍的時間（秒） */
export const JUMP_SECONDS = 0.45;
/** 弧線比起點、終點較高者再高多少 */
const JUMP_ARC_M = 0.25;
/** 檯面邊緣留多少不站（貓的腳要在檯面上） */
const EDGE_INSET_M = 0.12;
/** 離檯面多近就可以起跳 */
const JUMP_REACH_M = 0.45;

/** 可以站上去的檯面：旋轉矩形（中心、半寬、半深、轉角）＋高度；box 是 scene.boxes 的索引（點擊對應用） */
export interface Surface { box: number; kind: string; x: number; z: number; hx: number; hz: number; rotY: number; y: number }

/** 平面點 → 檯面自己的座標（同 catwalk.blocked 的換算） */
function toLocal(s: Pick<Surface, "x" | "z" | "rotY">, x: number, z: number): [number, number] {
  const dx = x - s.x, dz = z - s.z;
  const c = Math.cos(s.rotY), n = Math.sin(s.rotY);
  return [dx * c - dz * n, dx * n + dz * c];
}
function toWorld(s: Pick<Surface, "x" | "z" | "rotY">, lx: number, lz: number): [number, number] {
  const c = Math.cos(s.rotY), n = Math.sin(s.rotY);
  return [s.x + lx * c + lz * n, s.z - lx * n + lz * c];
}

/**
 * 讀圖完成的家具中，標 walkable 的（沙發、床、桌、書桌、櫃子、電視櫃、中島）都是檯面。
 * 沙發只算坐墊：高度約 0.58 倍、扣掉扶手與靠背；床只算棉被、不含枕頭與床頭板（家具模型庫，正面朝 +Z）。
 */
export function surfaces(scene: RoomScene): Surface[] {
  return scene.boxes.flatMap((b, box) => {
    if (b.kind !== "furniture" || !b.walkable) return [];
    if (b.furniture === "bed") {
      // 只算棉被那一段（高 0.5 m）：床頭的枕頭比較高（0.58 m）、床頭板更高，站上去腳會陷進去（Tina 2026-11-03）
      // 模型庫的床深 2 m：棉被從正面到距離床頭 0.65 m 處
      const k = b.sz / 2.0;
      const [x, z] = toWorld(b, 0, 0.325 * k);
      return [{ box, kind: "bed", x, z, hx: b.sx / 2, hz: 0.675 * k, rotY: b.rotY, y: b.sy }];
    }
    if (b.furniture === "sofa") {
      const [x, z] = toWorld(b, 0, b.sz * 0.22);
      return [{ box, kind: "sofa", x, z, hx: Math.max(b.sx / 2 - 0.15, 0.2), hz: b.sz * 0.27, rotY: b.rotY, y: b.sy * 0.58 }];
    }
    return [{ box, kind: b.furniture ?? "other", x: b.x, z: b.z, hx: b.sx / 2, hz: b.sz / 2, rotY: b.rotY, y: b.sy }];
  }).filter(s => s.y <= MAX_JUMP_M);
}

/** 點在檯面上（往內縮 inset） */
export function onTop(s: Surface, x: number, z: number, inset = EDGE_INSET_M): boolean {
  const [lx, lz] = toLocal(s, x, z);
  return Math.abs(lx) <= Math.max(s.hx - inset, 0.02) && Math.abs(lz) <= Math.max(s.hz - inset, 0.02);
}

/** 把點夾到檯面上（往內縮 inset） */
export function clampTop(s: Surface, x: number, z: number, inset = EDGE_INSET_M): { x: number; z: number } {
  const [lx, lz] = toLocal(s, x, z);
  const ax = Math.max(s.hx - inset, 0.02), az = Math.max(s.hz - inset, 0.02);
  const [wx, wz] = toWorld(s, Math.min(Math.max(lx, -ax), ax), Math.min(Math.max(lz, -az), az));
  return { x: wx, z: wz };
}

/** 檯面外、靠 (x, z) 最近的地板點：先夾到檯面邊緣，再往外推一個貓身 */
export function besideTop(s: Surface, x: number, z: number): { x: number; z: number } {
  const [lx, lz] = toLocal(s, x, z);
  const cx = Math.min(Math.max(lx, -s.hx), s.hx), cz = Math.min(Math.max(lz, -s.hz), s.hz);
  // 往外推的方向：點在檯面外就朝點的方向；在檯面裡就朝最近的邊
  let ox = lx - cx, oz = lz - cz;
  if (Math.hypot(ox, oz) < 1e-6) {
    const gaps = [s.hx - lx, s.hx + lx, s.hz - lz, s.hz + lz];
    const k = gaps.indexOf(Math.min(...gaps));
    [ox, oz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][k];
  }
  const n = Math.hypot(ox, oz);
  const push = CAT_RADIUS_M + 0.05;
  const [wx, wz] = toWorld(s, cx + (ox / n) * push, cz + (oz / n) * push);
  return { x: wx, z: wz };
}

const distToTop = (s: Surface, x: number, z: number) => {
  const [lx, lz] = toLocal(s, x, z);
  return Math.hypot(Math.max(Math.abs(lx) - s.hx, 0), Math.max(Math.abs(lz) - s.hz, 0));
};

/** 目標：地板上的一點（surface＝null）或某個檯面上的一點 */
export interface Goal { x: number; z: number; surface: number | null }
export interface Jump { fx: number; fz: number; fy: number; tx: number; tz: number; ty: number; t: number; to: number | null }
/** 貓的狀態：on＝站在哪個檯面（surfaces 的索引，null＝地板）；jump＝跳躍中 */
export interface Actor extends CatState { y: number; on: number | null; jump: Jump | null }
export interface World { scene: RoomScene; obs: Obstacle[]; tops: Surface[] }

export const worldOf = (scene: RoomScene, obs: Obstacle[]): World => ({ scene, obs, tops: surfaces(scene) });

const floorBlocked = (w: World) => (x: number, z: number) => blocked(x, z, w.scene, w.obs);

function startJump(a: Actor, to: { x: number; z: number }, toSurface: number | null, w: World): Actor {
  const ty = toSurface === null ? 0 : w.tops[toSurface].y;
  return {
    ...a, moving: true, heading: headingTo(to.x - a.x, to.z - a.z),
    jump: { fx: a.x, fz: a.z, fy: a.y, tx: to.x, tz: to.z, ty, t: 0, to: toSurface },
  };
}

/**
 * 每格呼叫一次。回傳新的狀態與 done（到達目標或走不到了，呼叫端清掉目標）。
 * 流程：同一層（都在地板或同一個檯面）直接走；要上檯面＝走到旁邊再跳上去；要下來或換檯面＝走到邊緣、先跳到地板。
 */
/** 這一格剛落地（上一格還在跳、這一格跳完）：跳上、跳下家具都算，播落地音效用 */
export const justLanded = (before: Actor, after: Actor): boolean => before.jump !== null && after.jump === null;

export function stepActor(a: Actor, goal: Goal | null, w: World, dt: number): { actor: Actor; done: boolean } {
  // 跳躍中：沿弧線移動，落地後換到新的那一層
  if (a.jump) {
    const j = a.jump;
    const t = Math.min(1, j.t + dt / JUMP_SECONDS);
    const peak = Math.max(j.fy, j.ty) + JUMP_ARC_M;
    // 二次貝茲：起點 → 頂點 → 終點
    const y = (1 - t) ** 2 * j.fy + 2 * (1 - t) * t * peak + t ** 2 * j.ty;
    const moved = { ...a, x: j.fx + (j.tx - j.fx) * t, z: j.fz + (j.tz - j.fz) * t, y };
    if (t < 1) return { actor: { ...moved, jump: { ...j, t } }, done: false };
    const landed: Actor = { ...moved, y: j.ty, on: j.to, jump: null, moving: false };
    const arrived = !goal || (goal.surface === j.to && Math.hypot(goal.x - landed.x, goal.z - landed.z) < 0.08);
    return { actor: landed, done: arrived };
  }
  if (!goal) return { actor: { ...a, moving: false }, done: true };

  const here = a.on === null ? null : w.tops[a.on];
  // 同一層：直接走
  if (goal.surface === a.on) {
    const target = here ? clampTop(here, goal.x, goal.z) : goal;
    const next = here ? stepToward(a, target, (x, z) => !onTop(here, x, z, EDGE_INSET_M * 0.5), dt) : stepCat(a, target, w.scene, w.obs, dt);
    return { actor: { ...a, ...next }, done: !next.moving };
  }

  // 在檯面上、要去別的地方：走到靠目標那側的邊緣，跳到旁邊的地板
  if (here) {
    const land = besideTop(here, goal.x, goal.z);
    const edge = clampTop(here, land.x, land.z);
    const next = stepToward(a, edge, (x, z) => !onTop(here, x, z, EDGE_INSET_M * 0.5), dt);
    if (next.moving) return { actor: { ...a, ...next }, done: false };
    // 落地點被擋住：試另外三個方向（檯面中心往四邊）
    const options = [land, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oz]) => {
      const [x, z] = toWorld(here, ox * (here.hx + 1), oz * (here.hz + 1));
      return besideTop(here, x, z);
    })];
    const ok = options.find(p => !floorBlocked(w)(p.x, p.z));
    return ok ? { actor: startJump({ ...a, ...next }, ok, null, w), done: false } : { actor: { ...a, ...next }, done: true };
  }

  // 在地板上、要上檯面：走到檯面旁邊，夠近就跳上去
  const top = w.tops[goal.surface!];
  if (!top) return { actor: { ...a, moving: false }, done: true };
  const landOn = clampTop(top, goal.x, goal.z);
  const near = distToTop(top, a.x, a.z) <= JUMP_REACH_M;
  if (near) {
    // 落在檯面上靠貓這一側、但往目標方向
    const start = clampTop(top, a.x, a.z);
    const land = { x: (start.x + landOn.x) / 2, z: (start.z + landOn.z) / 2 };
    return { actor: startJump(a, clampTop(top, land.x, land.z), goal.surface, w), done: false };
  }
  const beside = besideTop(top, a.x, a.z);
  const next = stepCat(a, beside, w.scene, w.obs, dt);
  return { actor: { ...a, ...next }, done: !next.moving && distToTop(top, next.x, next.z) > JUMP_REACH_M };
}

/** 閒置時要做什麼：在地板上逛；在床或沙發上睡覺 */
export function idleAction(a: Actor, w: World, rand: () => number = Math.random): { wander: Goal | null; sleep: boolean } {
  if (a.on !== null) return { wander: null, sleep: ["bed", "sofa"].includes(w.tops[a.on]?.kind ?? "") };
  const p = wanderSpot(w.scene, w.obs, rand);
  return { wander: p ? { ...p, surface: null } : null, sleep: false };
}

/** 點到家具：box 是 scene.boxes 的索引；可以站的家具回傳那個檯面的目標，其他回 null（當作點地板） */
export function goalForBox(w: World, box: number, x: number, z: number): Goal | null {
  const i = w.tops.findIndex(s => s.box === box);
  return i < 0 ? null : { ...clampTop(w.tops[i], x, z), surface: i };
}
