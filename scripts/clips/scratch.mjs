// 磨爪動作（Meowho #354 第 2 份，2026-11-16）：平放在地上的貓抓板。直接用各體型自己的骨架擺姿勢、烘焙成 scratch 動畫加進 glb。
// 姿勢：後腳原地踩穩、前半身壓低（像伸懶腰），兩隻前腳輪流「往前伸 → 搭上板面 → 沿板面扒回胸口 → 抬起」，頭略低看著前爪，尾巴微翹慢擺。
// 做法同 eat_drink.mjs：腿只繞貓的左右軸（X）在側面平面解兩節 IK（不 roll、不外八），腳踝、腳趾維持站姿方向（腳掌平貼）。
// 動畫通道照 idle 複製一份（同樣的骨頭、同樣的眨眼形狀鍵），再改寫骨頭的旋轉與 root 位移；已經有 scratch 就整段重做。
// 用法（需要 three 與 gltf-transform，不在專案相依裡，臨時裝）：
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions
//   node scripts/clips/scratch.mjs public/hq-cat-models/base/base_clips.glb public/hq-cat-models/base/base_clips.glb adult
//   node scripts/clips/scratch.mjs public/hq-cat-models/base/base_clips_kitten.glb public/hq-cat-models/base/base_clips_kitten.glb kitten
// 成貓改完要手動上傳覆蓋 Storage meow-cat-models/base/v1/base_clips.glb（幼貓直接用 repo 檔）。
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const wp = o => o.getWorldPosition(new THREE.Vector3());
function build(doc) {
  const map = new Map(), objs = {};
  const mk = n => {
    const ob = new THREE.Object3D(); ob.name = n.getName();
    ob.position.fromArray(n.getTranslation()); ob.quaternion.fromArray(n.getRotation()); ob.scale.fromArray(n.getScale());
    ob.userData.rest = { p: ob.position.clone(), q: ob.quaternion.clone(), s: ob.scale.clone() };
    map.set(n, ob); objs[ob.name] = ob;
    for (const c of n.listChildren()) ob.add(mk(c));
    return ob;
  };
  const scene = new THREE.Object3D();
  for (const n of doc.getRoot().getDefaultScene().listChildren()) scene.add(mk(n));
  scene.updateMatrixWorld(true);
  return { scene, objs, map };
}
function reset(objs, scene) {
  for (const o of Object.values(objs)) { o.position.copy(o.userData.rest.p); o.quaternion.copy(o.userData.rest.q); o.scale.copy(o.userData.rest.s); }
  scene.updateMatrixWorld(true);
}
function capture(objs) { const r = {}; for (const [n, o] of Object.entries(objs)) r[n] = { p: wp(o), q: o.getWorldQuaternion(new THREE.Quaternion()) }; return r; }
function rotWorld(b, axis, ang) {
  const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
  const R = new THREE.Quaternion().setFromAxisAngle(axis, ang);
  b.quaternion.premultiply(pw.clone().invert().multiply(R).multiply(pw)); b.updateMatrixWorld(true);
}
function setWorldQuat(b, q) { const pw = b.parent.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.copy(pw.invert().multiply(q)); b.updateMatrixWorld(true); }
const yzAng = v => Math.atan2(v.z, v.y);
/** 側面平面（繞 X）兩節 IK：a、b 只繞 X 轉，讓 cTip 落到 T；side=+1 中間關節往前（+Z）、-1 往後 */
function planarIk(a, b, cTip, T, side) {
  const A = wp(a), B = wp(b), C = wp(cTip);
  const yz = v => new THREE.Vector2(v.z, v.y);
  const L1 = yz(B).distanceTo(yz(A)), L2 = yz(C).distanceTo(yz(B));
  const t = yz(T).sub(yz(A));
  let D = Math.min(t.length(), L1 + L2 - 1e-6); D = Math.max(D, Math.abs(L1 - L2) + 1e-6);
  const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
  const base = Math.atan2(t.y, t.x);
  let best = null;
  for (const sg of [1, -1]) {
    const ang = base + sg * al, d = new THREE.Vector2(Math.cos(ang), Math.sin(ang)).multiplyScalar(L1);
    const cross = t.x * d.y - t.y * d.x;
    if (!best || cross * side > best.c) best = { Bn: d.add(yz(A)), c: cross * side };
  }
  const Bw = new THREE.Vector3(B.x, best.Bn.y, best.Bn.x);
  rotWorld(a, X, yzAng(Bw.clone().sub(A)) - yzAng(B.clone().sub(A)));
  const B2 = wp(b), C2 = wp(cTip);
  rotWorld(b, X, yzAng(T.clone().sub(B2)) - yzAng(C2.clone().sub(B2)));
}

/** 一隻前腳在一個循環裡（phase 0～1）的腳掌位置：前 60% 搭在板面上從前往後扒，後 40% 抬起往前伸回去 */
function paw(rest, p, phase) {
  const z0 = rest.z + p.reach, z1 = rest.z + p.pull, yb = rest.y + p.board;
  if (phase < 0.6) { const u = phase / 0.6; return new THREE.Vector3(rest.x, yb, z0 + (z1 - z0) * (u * u * (3 - 2 * u))); }
  const u = (phase - 0.6) / 0.4;
  return new THREE.Vector3(rest.x, yb + p.lift * Math.sin(Math.PI * u), z1 + (z0 - z1) * u);
}

function pose(objs, rest, scene, p, t) {
  objs.root.position.y -= p.drop; scene.updateMatrixWorld(true);
  rotWorld(objs.body, X, p.bodyP); rotWorld(objs.body_bot, X, -p.bodyP);  // 前半身壓低、臀部維持
  rotWorld(objs.body_top0, X, p.a0); rotWorld(objs.body_top1, X, p.a1);
  // 扒的時候肩膀跟著前後晃一點
  const sway = Math.sin(2 * Math.PI * t / p.sec);
  rotWorld(objs.neck0, X, p.n0); rotWorld(objs.neck1, X, p.n1); rotWorld(objs.head0, X, p.h);
  rotWorld(objs.body_top1, Y, p.sway * sway);
  for (const [lr, off] of [['left', 0], ['right', 0.5]]) {
    const f = 'leg_front_' + lr, h = 'leg_hind_' + lr;
    const T = paw(rest[f + '_ankle'].p, p, ((t / p.sec + off) % 1 + 1) % 1);
    // 前腳：肩胛（top0）往前轉 scap（越往前伸轉越多），把肩關節送到前面；上臂 top1＋前臂 bot0 接到腳掌，手肘往後；腳踝、腳趾維持站姿方向
    rotWorld(objs[f + '_top0'], X, -p.scap * (0.6 + 0.4 * (T.z - rest[f + '_ankle'].p.z - p.pull) / Math.max(p.reach - p.pull, 1e-6)));
    planarIk(objs[f + '_top1'], objs[f + '_bot0'], objs[f + '_ankle'], T, -1);
    setWorldQuat(objs[f + '_ankle'], rest[f + '_ankle'].q.clone()); setWorldQuat(objs[f + '_toe'], rest[f + '_toe'].q.clone());
    // 後腳：大腿＋小腿接回站姿的跗蹠，膝蓋往前；跗蹠維持站姿方向
    planarIk(objs[h + '_top0'], objs[h + '_top1'], objs[h + '_bot0'], rest[h + '_bot0'].p.clone(), 1);
    setWorldQuat(objs[h + '_bot0'], rest[h + '_bot0'].q.clone());
  }
  for (let i = 0; i < 7; i++) {
    const b = objs['tail' + i]; if (!b) continue;
    if (i < 2) rotWorld(b, X, -p.tailUp);                                           // 尾巴根部微翹
    rotWorld(b, Y, THREE.MathUtils.degToRad((3 + i) * Math.sin(2 * Math.PI * t / 2.4 - i * 0.4)));
  }
  scene.updateMatrixWorld(true);
}

// 各體型自己的參數（模型單位＝公尺、弧度），2026-11-16 用 CPU 蒙皮畫側面、正面剪影確認：前腳掌跟得上目標、身體最低點不低於地板 0.4 公分。
// reach／pull＝腳掌比站姿往前多少（伸出去／扒回來），board＝板面高，lift＝抬腳高度，scap＝肩胛往前轉（不轉的話手伸不到），sec＝一隻腳扒一次幾秒。
// 幼貓頭大脖子短，壓低和低頭都要比成貓少，不然臉會埋進板子、胸口穿到地板下；幼貓尾巴原本就是翹的，不再往上翹。
export const BODIES = {
  adult: { drop: 0.02, bodyP: 0.35, a0: 0.28, a1: 0.22, n0: 0.12, n1: 0.12, h: 0.12, reach: 0.13, pull: 0.01, scap: 0.7, board: 0.02, lift: 0.035, sway: 0.05, tailUp: 0.15, sec: 0.8 },
  kitten: { drop: 0.004, bodyP: 0.24, a0: 0.12, a1: 0.10, n0: 0.0, n1: 0.05, h: 0.15, reach: 0.045, pull: 0.003, scap: 0.6, board: 0.007, lift: 0.012, sway: 0.05, tailUp: 0, sec: 0.7 },
};

const [src, dst, body = 'adult'] = process.argv.slice(2);
if (src && dst) {
  const P = BODIES[body]; if (!P) throw new Error('body 要是 adult 或 kitten');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(src);
  const { scene, objs, map } = build(doc); const rest = capture(objs);
  const root = doc.getRoot(), buf = root.listBuffers()[0];
  const idle = root.listAnimations().find(a => a.getName() === 'idle');
  root.listAnimations().filter(a => a.getName() === 'scratch').forEach(a => a.dispose());
  const anim = doc.createAnimation('scratch');
  const FPS = 30, DUR = P.sec * 3, STEP = 2;
  const times = [];
  const chans = idle.listChannels().filter(ch => ch.getTargetPath() !== 'weights');
  const vals = chans.map(() => []);
  for (let f = 0; f <= Math.round(DUR * FPS); f += STEP) {
    const t = f / FPS; times.push(t);
    reset(objs, scene); pose(objs, rest, scene, P, t);
    chans.forEach((ch, k) => { const o = map.get(ch.getTargetNode()), path = ch.getTargetPath(); vals[k].push(...(path === 'rotation' ? o.quaternion : path === 'translation' ? o.position : o.scale).toArray()); });
  }
  const input = doc.createAccessor('scratch_t').setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buf);
  chans.forEach((ch, k) => {
    const path = ch.getTargetPath();
    const out = doc.createAccessor().setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(vals[k])).setBuffer(buf);
    const s = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(path).setSampler(s));
  });
  // 眨眼（形狀鍵）沿用 idle 的關鍵影格
  for (const ch of idle.listChannels().filter(c => c.getTargetPath() === 'weights')) {
    const o = ch.getSampler();
    const s = doc.createAnimationSampler().setInput(o.getInput()).setOutput(o.getOutput()).setInterpolation(o.getInterpolation());
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath('weights').setSampler(s));
  }
  for (const a of root.listAccessors()) if (a.listParents().length <= 1) a.dispose();
  await io.write(dst, doc);
  console.log('scratch', body, chans.length, 'channels', times.length, 'keys', DUR.toFixed(2) + 's');
}
