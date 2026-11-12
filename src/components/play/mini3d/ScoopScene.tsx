"use client";
// 虛擬飼養第 1 份：鏟屎特寫（第一視角）。右手拿貓砂鏟，玩家按住畫面拖曳，鏟子跟著走；左手撐著垃圾袋。
// 鏟起來時鏟子上是一堆砂蓋著東西，左右甩砂子會從縫漏回砂盆；到垃圾袋上方放開，鏟子傾斜把東西倒進去。
// 哪一塊在哪、鏟子上還有多少砂由 lib/play/mini3d/scoop-rules.ts 算，這裡負責讀拖曳和擺畫面。放在 <Canvas> 裡用。
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { MathUtils, Matrix4, Plane, Quaternion, Vector3, type Group, type Mesh } from "three";
import { LITTER_BOXES, SCOOP_MAX, scoopLoad, scoopStep, type LitterBoxKind, type ScoopEvent, type ScoopState } from "@/lib/play/mini3d/scoop-rules";
import { KibbleFall } from "./FeedProps";
import { BAG, ClumpMesh, LitterBox, sandY, SCOOP_HEAD, ScoopShovel, TrashBag } from "./ScoopProps";
import { useScenePointer } from "./useScenePointer";
import { HAND_POSES, WaterHand } from "./WaterHands";

// 右手的方向：手臂從畫面下方（自己這邊）伸進來，鏟子（手的拇指側）朝左、微微朝下。
// 手臂從右邊橫進來的話，鏟子拿到左邊的垃圾袋時袖子會整條蓋住砂盆
const TOOL = new Vector3(-0.92, -0.2, -0.2).normalize(), ELBOW = new Vector3(0.15, 0.35, 0.95);
const ARM = ELBOW.clone().addScaledVector(TOOL, -ELBOW.dot(TOOL)).normalize();
const RIGHT_TURN = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(TOOL, new Vector3().crossVectors(ARM, TOOL), ARM));
/** 鏟頭中心相對右手手腕的位置（手自己的座標） */
const HEAD_IN_HAND = new Vector3(...HAND_POSES.grip.at).add(new Vector3(SCOOP_HEAD, 0, 0));
const TOOL_AXIS = new Vector3(1, 0, 0);
/** 鏟子離垃圾袋中心多近算「在袋子上方」 */
const OVER_BAG = 0.1;
/** 甩一下之後砂子漏幾秒；倒進垃圾袋的動作幾秒、鏟子傾斜多少（弧度） */
const SIFT_SECONDS = 0.3, DUMP_SECONDS = 0.45, DUMP_TILT = 1.1;
const SAND = 0xd8cbb0;
const SLOTS = Array.from({ length: 8 }, (_, i) => i), LOAD = Array.from({ length: SCOOP_MAX }, (_, i) => i);

/** state：這一局的狀態（遊戲那邊建，這裡每一格更新）；onEvent：鏟起、甩、掉了、丟進袋子時通知 */
export function ScoopScene({ box, state, onEvent }: { box: LitterBoxKind; state: RefObject<ScoopState>; onEvent: (e: Exclude<ScoopEvent, null>) => void }) {
  const camera = useThree((s) => s.camera);
  const { w, d, h } = LITTER_BOXES[box], sand = sandY(box);
  const bagAt = useMemo(() => new Vector3(-(w / 2 + 0.14), 0, 0.02), [w]);
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), -(sand + 0.02)), [sand]);
  const right = useRef<Group>(null), pile = useRef<Mesh>(null), under = useRef<Group>(null);
  const clumps = useRef<(Group | null)[]>([]), loads = useRef<(Group | null)[]>([]), falls = useRef<(Group | null)[]>([]);
  const target = useRef(new Vector3(w / 2 - 0.08, sand + 0.02, 0.04)), head = useRef(target.current.clone());
  const down = useRef(false), sifting = useRef(false), siftLeft = useRef(0);
  /** 正在倒進垃圾袋：t 是進度 0～1，poops 是倒的那幾塊是不是大便，from 是開始倒的位置 */
  const dump = useRef<{ t: number; poops: boolean[]; from: Vector3 } | null>(null);
  const v = useMemo(() => ({ hit: new Vector3(), a: new Vector3(), q: new Quaternion() }), []);

  useEffect(() => { camera.position.set(-0.12, 0.8, 0.5); camera.lookAt(-0.13, 0.03, 0); }, [camera]);

  const aim = (ray: { ray: { intersectPlane: (p: Plane, to: Vector3) => Vector3 | null } }) => {
    if (!ray.ray.intersectPlane(plane, v.hit)) return;
    target.current.set(MathUtils.clamp(v.hit.x, bagAt.x - 0.04, w / 2 + 0.1), 0, MathUtils.clamp(v.hit.z, -d / 2 - 0.06, d / 2 + 0.1));
  };
  useScenePointer({
    down(_, ray) { down.current = true; aim(ray); },
    move(_, ray) { aim(ray); },
    release() { down.current = false; },
    reset() { down.current = false; },
  });

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1), now = head.current, was = now.clone();
    const before = scoopLoad(state.current).map((i) => state.current.clumps[i].poop);
    // 鏟子上有東西就抬離砂面，看得到鏟到什麼；靠近垃圾袋那一側再舉高，越過盆壁、到袋口上方
    const lift = MathUtils.smoothstep(-w / 2 + 0.08 - target.current.x, 0, 0.1);
    target.current.y = MathUtils.lerp(sand + (before.length ? 0.07 : 0.02), Math.max(h, BAG.h) + 0.07, lift);
    now.lerp(target.current, 1 - Math.exp(-16 * dt));
    // 速度用真正過了多久來算：畫面卡一下（dt 被壓到 0.1 秒）不該被當成動作太大
    const elapsed = Math.max(raw, 1e-3), vx = (now.x - was.x) / elapsed;
    const speed = Math.hypot(now.x - was.x, now.z - was.z) / elapsed;

    const step = scoopStep(state.current, box, { x: now.x, z: now.z, down: down.current, speed, vx, overBag: Math.hypot(now.x - bagAt.x, now.z - bagAt.z) < OVER_BAG });
    state.current = step.state;
    if (step.event) onEvent(step.event);
    if (step.event === "shake" || step.event === "sifted") siftLeft.current = SIFT_SECONDS;
    if (step.event === "bagged" || step.event === "baggedSandy") dump.current = { t: 0, poops: before, from: now.clone() };

    // 漏砂：甩完之後砂子從鏟子底下掉一小段時間
    siftLeft.current = Math.max(0, siftLeft.current - dt);
    sifting.current = siftLeft.current > 0;

    // 倒進垃圾袋：鏟子繞握把傾斜，東西從鏟頭落進袋子
    const pour = dump.current;
    let tilt = 0;
    if (pour) {
      pour.t = Math.min(1, pour.t + dt / DUMP_SECONDS);
      tilt = Math.sin(Math.PI * pour.t) * DUMP_TILT;
      if (pour.t >= 1) dump.current = null;
    }
    falls.current.forEach((g, j) => {
      if (!g) return;
      g.visible = Boolean(pour) && j < (pour?.poops.length ?? 0);
      if (!pour || !g.visible) return;
      g.position.lerpVectors(pour.from, v.a.set(bagAt.x + (j - 1) * 0.02, 0.03, bagAt.z), pour.t * pour.t);
      g.children[0].visible = pour.poops[j]; g.children[1].visible = !pour.poops[j];
    });

    if (right.current) {
      right.current.quaternion.copy(RIGHT_TURN).multiply(v.q.setFromAxisAngle(TOOL_AXIS, tilt));
      right.current.position.copy(now).sub(v.a.copy(HEAD_IN_HAND).applyQuaternion(RIGHT_TURN));
    }
    under.current?.position.set(now.x, now.y - 0.006, now.z);

    // 砂裡的：半埋在砂面；鏟子上的：排在鏟頭上，上面蓋著還沒甩掉的砂
    const onScoop = scoopLoad(step.state);
    step.state.clumps.forEach((c, i) => {
      const g = clumps.current[i];
      if (!g) return;
      g.visible = c.at === "sand";
      g.position.set(c.x, sand - c.r * 0.25, c.z);
      g.rotation.y = c.rot;
    });
    LOAD.forEach((j) => {
      const g = loads.current[j], c = step.state.clumps[onScoop[j]];
      if (!g) return;
      g.visible = Boolean(c);
      if (c) { g.children[0].visible = c.poop; g.children[1].visible = !c.poop; }
    });
    if (pile.current) {
      pile.current.visible = step.state.sand > 0;
      pile.current.scale.set(0.04, 0.004 + 0.022 * step.state.sand, 0.032);
    }
  });

  return <>
    <hemisphereLight intensity={1.7} color={0xffffff} groundColor={0xd8c0a0} />
    <directionalLight position={[1, 2, 1.5]} intensity={2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}><circleGeometry args={[1, 40]} /><meshStandardMaterial color={0xd9ccb6} roughness={0.9} /></mesh>
    <LitterBox kind={box} />
    {SLOTS.map((i) => {
      const c = state.current.clumps[i];
      return c && <group key={i} ref={(g) => { clumps.current[i] = g; }}><ClumpMesh poop={c.poop} r={c.r} /></group>;
    })}
    <group position={bagAt}><TrashBag /></group>
    {/* 漏下去的砂、倒進垃圾袋時落下的東西（世界座標） */}
    <group ref={under} />
    <KibbleFall from={under} on={sifting} toY={sand} color={SAND} size={0.003} />
    {LOAD.map((j) => (
      <group key={j} ref={(g) => { falls.current[j] = g; }} visible={false}>
        <group><ClumpMesh poop r={0.014} /></group>
        <group><ClumpMesh poop={false} r={0.016} /></group>
      </group>
    ))}

    <group ref={right} quaternion={RIGHT_TURN} position={target.current.clone().sub(HEAD_IN_HAND.clone().applyQuaternion(RIGHT_TURN))}>
      <Suspense fallback={null}>
        <WaterHand id="water_hand_right" pose="grip">
          {/* 手是掌心朝下握著握把，鏟子要翻過來，盤面才朝上、東西才放得住 */}
          <group rotation={[Math.PI, 0, 0]}>
            <ScoopShovel />
            {LOAD.map((j) => (
              <group key={j} ref={(g) => { loads.current[j] = g; }} position={[SCOOP_HEAD - 0.022 + j * 0.022, 0.012, (j % 2) * 0.016 - 0.008]} visible={false}>
                <group rotation={[0, 0.6, 0]}><ClumpMesh poop r={0.014} /></group>
                <group><ClumpMesh poop={false} r={0.016} /></group>
              </group>
            ))}
            {/* 還沒甩掉的砂：蓋在東西上面的一堆，越甩越扁 */}
            <mesh ref={pile} position={[SCOOP_HEAD, 0.004, 0]} visible={false}>
              <sphereGeometry args={[1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={SAND} roughness={1} />
            </mesh>
          </group>
        </WaterHand>
      </Suspense>
    </group>
    {/* 左手：手掌貼著袋口左緣，把垃圾袋撐著 */}
    <group position={[bagAt.x - BAG.r - 0.012, BAG.h + 0.01, bagAt.z + 0.085]} rotation={[0.2, -0.15, -Math.PI / 2]}>
      <Suspense fallback={null}><WaterHand id="water_hand_left" pose="hold" /></Suspense>
    </group>
  </>;
}
