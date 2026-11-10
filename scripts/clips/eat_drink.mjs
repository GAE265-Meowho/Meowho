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
const [src,dst,body='kitten']=process.argv.slice(2);
const {io,doc}=await load(src); const {scene,objs,map}=build(doc); const rest=capture(objs,scene);
const FPS=30, N=120, STEP=2, Y=new THREE.Vector3(0,1,0);
// 幼貓專用參數（只用幼貓骨架擺，不沿用成貓 needs_clips.py 的公尺目標）
// 各體型自己的參數（公尺、弧度），用各自的骨架搜尋、渲染確認後定案
const BODIES={
  // 幼貓：頭大脖子短，微蹲就夠；鼻尖離地約 4 cm、在前腳掌前方約 4 cm
  kitten:{BASE:{drop:0.009, spine:0.15, n0:0.5, n1:0.28}, CLIPS:{ eat:{h:0.25, nod:6, sec:0.8}, drink:{h:0.33, nod:3, sec:0.4} }},
  // 成貓：站姿鼻尖離地 37 cm，前半身要真的蹲下；前傾分給兩節脊椎、脖子往前伸（n0、n1 負＝往上抬回），避免脖子折痕、頭縮進胸口
  // 鼻尖離地約 6 cm、在前腳掌前方約 7 cm（腳踩在碗外，#304）
  adult:{BASE:{drop:0.07, spine:0.7, spine1:0.6, n0:-0.35, n1:-0.2}, CLIPS:{ eat:{h:0.3, nod:6, sec:0.8}, drink:{h:0.4, nod:3, sec:0.4} }},
};
const {BASE,CLIPS}=BODIES[body];
const buf=doc.getRoot().listBuffers()[0];
for(const [name,c] of Object.entries(CLIPS)){
  const anim=doc.getRoot().listAnimations().find(a=>a.getName()===name);
  const chans=anim.listChannels().filter(ch=>ch.getTargetPath()!=='weights');
  const times=[], vals=chans.map(()=>[]);
  for(let f=0; f<=N; f+=STEP){ const t=f/FPS; times.push(t);
    reset(objs); scene.updateMatrixWorld(true);
    const nod=THREE.MathUtils.degToRad(c.nod*Math.max(0,Math.sin(2*Math.PI*t/c.sec)));
    pose(objs,rest,scene,{...BASE,h:c.h+nod});
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
