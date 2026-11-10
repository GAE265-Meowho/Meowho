// 吃飯、喝水動作（Meowho #330，2026-11-10）：直接用各體型自己的骨架擺姿勢、烘焙成 eat／drink 動畫寫回 glb（幼貓 base_clips_kitten.glb、成貓 base_clips.glb）。
// 不沿用 scripts/blender/needs_clips.py（舊版成貓整隻趴低 9 cm、脖子折出摺痕、頭塞進胸口；幼貓套同一組公尺目標則胸口塌陷）。
// 姿勢：整隻微蹲 → 前半身微往前下傾 → 脖子往前下伸、頭朝碗 → 四隻腳兩節 IK 把腕／踝拉回站姿位置（腳掌不離地、不滑）。
// 吃飯每 0.8 秒咀嚼點頭 6°；喝水頭再低一點、每 0.4 秒舔水 3°；尾巴根部放低、慢慢左右擺。眨眼（形狀鍵）沿用原本的關鍵影格。
// 用法（需要 three 與 gltf-transform，不在專案相依裡，臨時裝）：
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions
//   node scripts/clips/eat_drink.mjs public/hq-cat-models/base/base_clips_kitten.glb public/hq-cat-models/base/base_clips_kitten.glb kitten
//   node scripts/clips/eat_drink.mjs public/hq-cat-models/base/base_clips.glb public/hq-cat-models/base/base_clips.glb adult
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
export async function load(path){ const io=new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc=await io.read(path); return {io,doc}; }
// build three hierarchy from scene
export function build(doc){
  const root=doc.getRoot(); const map=new Map(); const objs={};
  const mk=n=>{const ob=new THREE.Object3D(); ob.name=n.getName();
    ob.position.fromArray(n.getTranslation()); ob.quaternion.fromArray(n.getRotation()); ob.scale.fromArray(n.getScale());
    ob.userData.rest={p:ob.position.clone(),q:ob.quaternion.clone()}; map.set(n,ob); objs[ob.name]=ob;
    for(const c of n.listChildren()) ob.add(mk(c)); return ob;};
  const scene=new THREE.Object3D(); for(const n of root.getDefaultScene().listChildren()) scene.add(mk(n));
  scene.updateMatrixWorld(true); return {scene,objs,map};
}
export function sample(anim, map, t){
  for(const ch of anim.listChannels()){
    const ob=map.get(ch.getTargetNode()); if(!ob) continue; const path=ch.getTargetPath(); if(path==='weights')continue;
    const s=ch.getSampler(); const ti=s.getInput().getArray(); const v=s.getOutput().getArray();
    let i=0; while(i<ti.length-1 && ti[i+1]<=t) i++; const j=Math.min(i+1,ti.length-1); const a=j===i?0:Math.min(1,Math.max(0,(t-ti[i])/(ti[j]-ti[i])));
    if(path==='rotation'){const q1=new THREE.Quaternion().fromArray(v,i*4),q2=new THREE.Quaternion().fromArray(v,j*4); ob.quaternion.copy(q1.slerp(q2,a));}
    else{const p1=new THREE.Vector3().fromArray(v,i*3),p2=new THREE.Vector3().fromArray(v,j*3); (path==='translation'?ob.position:ob.scale).copy(p1.lerp(p2,a));}
  }
}
export function reset(objs){for(const o of Object.values(objs)){o.position.copy(o.userData.rest.p);o.quaternion.copy(o.userData.rest.q);}}
export const wp=o=>o.getWorldPosition(new THREE.Vector3());
const X=new THREE.Vector3(1,0,0);
export function rotWorld(b, axis, ang){ const pw=b.parent.getWorldQuaternion(new THREE.Quaternion()); const R=new THREE.Quaternion().setFromAxisAngle(axis,ang);
  b.quaternion.premultiply(pw.clone().invert().multiply(R).multiply(pw)); b.updateMatrixWorld(true); }
export function rotFromTo(b, from, to){ const R=new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  const pw=b.parent.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.premultiply(pw.clone().invert().multiply(R).multiply(pw)); b.updateMatrixWorld(true);}
export function setWorldQuat(b,q){ const pw=b.parent.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.copy(pw.invert().multiply(q)); b.updateMatrixWorld(true);}
// rest info captured once
export function capture(objs, scene){ scene.updateMatrixWorld(true); const r={}; for(const [n,o] of Object.entries(objs)) r[n]={p:wp(o), q:o.getWorldQuaternion(new THREE.Quaternion())}; return r; }
function ik(objs, rest, leg, pole){
  const a=objs[leg+'_top0'], b=objs[leg+'_top1'], c=objs[leg+'_bot0'];
  const T=rest[leg+'_bot0'].p.clone();
  const A=wp(a), B=wp(b);
  const l1=rest[leg+'_top1'].p.distanceTo(rest[leg+'_top0'].p), l2=rest[leg+'_bot0'].p.distanceTo(rest[leg+'_top1'].p);
  let d=Math.min(A.distanceTo(T), l1+l2-1e-5); const dir=T.clone().sub(A).normalize();
  const x=(l1*l1-l2*l2+d*d)/(2*d), h=Math.sqrt(Math.max(0,l1*l1-x*x));
  const pd=pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const Bn=A.clone().add(dir.clone().multiplyScalar(x)).add(pd.multiplyScalar(h));
  rotFromTo(a, B.clone().sub(A), Bn.clone().sub(A));
  const B2=wp(b), C2=wp(c); rotFromTo(b, C2.clone().sub(B2), T.clone().sub(B2));
  setWorldQuat(c, rest[leg+'_bot0'].q.clone());
}
// p: {drop, spine, n0, n1, h}
export function pose(objs, rest, scene, p){
  objs.root.position.y -= p.drop; scene.updateMatrixWorld(true);
  rotWorld(objs.body_top0, X, p.spine);
  if(p.spine1) rotWorld(objs.body_top1, X, p.spine1);
  rotWorld(objs.neck0, X, p.n0); rotWorld(objs.neck1, X, p.n1); rotWorld(objs.head0, X, p.h);
  if(p.hip) rotWorld(objs.body_bot, X, p.hip);
  for(const lr of ['left','right']){
    ik(objs, rest, 'leg_front_'+lr, new THREE.Vector3(0, 0.2, -1));   // 手肘往後
    ik(objs, rest, 'leg_hind_'+lr, new THREE.Vector3(0, 0.2, 1));     // 膝蓋往前
  }
  scene.updateMatrixWorld(true);
}
// ---------- 成貓 v2：側面平面 IK（只繞 X 轉，不 roll）----------
const yzAng=v=>Math.atan2(v.z,v.y);   // 繞 +X 轉 θ：此角度 +θ
// 側面平面（繞 X）兩節 IK：a、b 只繞 X 轉，c 尾端落到 T；side=+1 中間關節往前（+Z）、-1 往後
function planarIk(a,b,cTip,T,side){
  const A=wp(a), B=wp(b), C=wp(cTip);
  const yz=v=>new THREE.Vector2(v.z,v.y);
  const L1=yz(B).distanceTo(yz(A)), L2=yz(C).distanceTo(yz(B));
  const t=yz(T).sub(yz(A)); let D=Math.min(t.length(), L1+L2-1e-6); D=Math.max(D,Math.abs(L1-L2)+1e-6);
  const al=Math.acos(Math.max(-1,Math.min(1,(L1*L1+D*D-L2*L2)/(2*L1*D))));
  const base=Math.atan2(t.y,t.x); // angle in (z,y) plane
  // 腿朝下時，cross(A→T, A→B) > 0 代表中間關節在前（+Z）
  let best=null;
  for(const sg of [1,-1]){ const ang=base+sg*al; const d=new THREE.Vector2(Math.cos(ang),Math.sin(ang)).multiplyScalar(L1);
    const cross=t.x*d.y-t.y*d.x; if(!best||cross*side>best.c) best={Bn:d.add(yz(A)),c:cross*side}; }
  const Bw=new THREE.Vector3(B.x,best.Bn.y,best.Bn.x);
  rotWorld(a,X, yzAng(Bw.clone().sub(A))-yzAng(B.clone().sub(A)));
  const B2=wp(b), C2=wp(cTip);
  rotWorld(b,X, yzAng(T.clone().sub(B2))-yzAng(C2.clone().sub(B2)));
}
// p: drop, bodyP（body 繞 X）, hipP（body_bot 反向，維持臀部）, a0, a1（兩節前胸）, n0, n1, h
function poseAdult(objs, rest, scene, p){
  objs.root.position.y -= p.drop; scene.updateMatrixWorld(true);
  if(p.bodyP) rotWorld(objs.body,X,p.bodyP);
  if(p.hipP) rotWorld(objs.body_bot,X,p.hipP);
  rotWorld(objs.body_top0,X,p.a0); rotWorld(objs.body_top1,X,p.a1);
  rotWorld(objs.neck0,X,p.n0); rotWorld(objs.neck1,X,p.n1); rotWorld(objs.head0,X,p.h);
  for(const lr of ['left','right']){
    const f='leg_front_'+lr, h='leg_hind_'+lr;
    // 前腳：前臂 bot0 從站姿腳掌位置往後倒 fa（手肘往後），肩胛 top0＋上臂 top1 平面 IK 接到手肘（肩關節往前），
    // 再把前臂轉到腳掌站姿位置；腳踝、腳趾維持站姿方向（腳掌平貼、不翻）
    const ank=rest[f+'_ankle'].p.clone(), elb0=rest[f+'_bot0'].p.clone();
    const Lf=new THREE.Vector2(elb0.z-ank.z, elb0.y-ank.y).length(); const ang0=Math.atan2(elb0.z-ank.z, elb0.y-ank.y);
    const fa=ang0-(p.fa||0);
    const E=new THREE.Vector3(elb0.x, ank.y+Lf*Math.cos(fa), ank.z+Lf*Math.sin(fa));
    planarIk(objs[f+'_top0'],objs[f+'_top1'],objs[f+'_bot0'],E,1);
    { const B=wp(objs[f+'_bot0']), C=wp(objs[f+'_ankle']); rotWorld(objs[f+'_bot0'],X, yzAng(ank.clone().sub(B))-yzAng(C.clone().sub(B))); }
    setWorldQuat(objs[f+'_ankle'],rest[f+'_ankle'].q.clone()); setWorldQuat(objs[f+'_toe'],rest[f+'_toe'].q.clone());
    // 後腳：大腿 top0＋小腿 top1，膝蓋往前；跗蹠 bot0 維持站姿方向
    planarIk(objs[h+'_top0'],objs[h+'_top1'],objs[h+'_bot0'],rest[h+'_bot0'].p.clone(),1);
    setWorldQuat(objs[h+'_bot0'],rest[h+'_bot0'].q.clone());
  }
  scene.updateMatrixWorld(true);
}

const [src,dst,body='kitten']=process.argv.slice(2);
const {io,doc}=await load(src); const {scene,objs,map}=build(doc); const rest=capture(objs,scene);
const FPS=30, N=120, STEP=2, Y=new THREE.Vector3(0,1,0);
// 幼貓專用參數（只用幼貓骨架擺，不沿用成貓 needs_clips.py 的公尺目標）
// 各體型自己的參數（公尺、弧度），用各自的骨架搜尋、渲染確認後定案
const BODIES={
  // 幼貓：頭大脖子短，微蹲就夠；鼻尖離地約 4 cm、在前腳掌前方約 4 cm
  kitten:{BASE:{drop:0.009, spine:0.15, n0:0.5, n1:0.28}, CLIPS:{ eat:{h:0.25, nod:6, sec:0.8}, drink:{h:0.33, nod:3, sec:0.4} }},
  // 成貓 v2（#336）：舊版（兩節脊椎 0.7／0.6、脖子往回抬、最小旋轉 IK）肩膀折尖角、胸口塌、上臂被扭、前腿外八，已作廢。
  // 新版：微蹲 9 cm；body 前傾 0.2（body_bot 反向 0.2 維持臀部）、body_top0 0.38、body_top1 0.31，背是緩弧；
  // 腿只繞貓的左右軸（X）在側面平面解 IK（不 roll、不外八）：前腳前臂往後倒 0.14（手肘往後）、肩胛＋上臂接手肘、腳踝腳趾維持站姿方向；
  // 後腳大腿＋小腿、膝蓋往前，跗蹠維持站姿方向。
  // 成貓骨架頸根在肩關節上方 16 cm、頸根到鼻尖只有 14 cm，在背線不折的前提下鼻尖到不了 4.5 cm＋前 7 cm；
  // Tina 2026-11-10 選折衷 B：吃飯鼻尖離地約 6.6 cm、在前腳掌前約 7 cm；喝水頭再低 0.1（約 6.1 cm）。身體兩者相同。
  adult:{ik:'planar', BASE:{drop:0.09, bodyP:0.20, hipP:-0.20, a0:0.38, a1:0.31, fa:0.14, n0:0.11, n1:0.21},
    CLIPS:{ eat:{h:-0.18, nod:6, sec:0.8}, drink:{h:-0.08, nod:3, sec:0.4} }},
};
const {BASE,CLIPS,ik:IK='min'}=BODIES[body];
const buf=doc.getRoot().listBuffers()[0];
for(const [name,c] of Object.entries(CLIPS)){
  const anim=doc.getRoot().listAnimations().find(a=>a.getName()===name);
  const chans=anim.listChannels().filter(ch=>{ const t=ch.getTargetPath(); if(t==='weights') return false;
    if(IK!=='planar') return true;
    return t==='rotation' || (t==='translation' && ch.getTargetNode().getName()==='root'); });   // 成貓只寫旋轉與 root 位移，不寫 scale
  const times=[], vals=chans.map(()=>[]);
  for(let f=0; f<=N; f+=STEP){ const t=f/FPS; times.push(t);
    reset(objs); scene.updateMatrixWorld(true);
    const nod=THREE.MathUtils.degToRad(c.nod*Math.max(0,Math.sin(2*Math.PI*t/c.sec)));
    if(IK==='planar') poseAdult(objs,rest,scene,{...BASE,h:c.h+nod}); else pose(objs,rest,scene,{...BASE,h:c.h+nod});
    for(let i=0;i<7;i++){ const b=objs['tail'+i]; if(!b) continue;
      if(i<2) rotWorld(b,X,THREE.MathUtils.degToRad(12));                       // 尾巴根部放低
      rotWorld(b,Y,THREE.MathUtils.degToRad((3+i)*Math.sin(2*Math.PI*t/4 - i*0.4))); }  // 慢慢擺
    chans.forEach((ch,k)=>{ const o=map.get(ch.getTargetNode()); const p=ch.getTargetPath();
      vals[k].push(...(p==='rotation'?o.quaternion.toArray():p==='translation'?o.position.toArray():o.scale.toArray())); });
  }
  const input=doc.createAccessor(name+'_t').setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buf);
  chans.forEach((ch,k)=>{ const p=ch.getTargetPath();
    const out=doc.createAccessor().setType(p==='rotation'?'VEC4':'VEC3').setArray(new Float32Array(vals[k])).setBuffer(buf);
    const s=doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    anim.addSampler(s); const old=ch.getSampler(); ch.setSampler(s); if(old.listParents().filter(x=>x.propertyType!=='Root').length<=1) old.dispose(); });
  console.log(name,'baked',chans.length,'channels',times.length,'keys');
}
// 清掉沒人用的 accessor
for(const a of doc.getRoot().listAccessors()) if(a.listParents().length<=1) a.dispose();
await io.write(dst,doc);
