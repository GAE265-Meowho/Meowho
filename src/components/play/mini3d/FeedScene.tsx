"use client";
// 虛擬飼養第 1 份：餵貓特寫（第一視角）。右手拿飼料袋往碗裡倒顆粒；開罐頭時右手先放下袋子，
// 左手拿罐頭進來、右手拉開拉環、左手把罐頭倒進碗。每一格的數值由外面（遊戲）給，這裡只負責擺成畫面。放在 <Canvas> 裡用。
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Matrix4, Quaternion, Vector3, type Group, type Mesh } from "three";
import type { CanFrame, FeedCan as CanKind } from "@/lib/play/mini3d/feed-rules";
import { BAG, BowlFood, CANS, FeedBag, FeedCan, KibbleFall } from "./FeedProps";
import { HAND_POSES, WaterHand, type HandPose } from "./WaterHands";
import { BOWL, WaterBowl } from "./WaterProps";

export type FeedFrame = CanFrame & {
  /** 飼料袋往碗傾倒的程度 0～1；pouring：顆粒正在掉 */
  bagTilt: number; pouring: boolean;
  /** 正在開的罐頭（沒有就 null） */
  can: CanKind | null;
  /** 碗裡的乾飼料量、有沒有主食罐、有沒有湯罐 */
  dry: number; wet: boolean; soup: boolean;
};

const BOWL_AT = new Vector3(0, 0, -0.06);
/** 東西掉進碗裡的位置 */
const BOWL_IN = BOWL_AT.clone().setY(BOWL.floor + 0.02);
// 手腕的位置：畫面外、拿著東西在碗旁邊（傾斜後袋口／罐口剛好在碗上方）
const R_FAR = new Vector3(0.5, 0.12, 0.62), R_READY = new Vector3(0.085, 0.185, 0.03);
const L_FAR = new Vector3(-0.5, 0.12, 0.62), L_READY = new Vector3(-0.01, 0.2, 0.03);
/** 手掌朝內握著東西時手腕翻的角度；傾倒時再多翻多少 */
const SIDE = Math.PI / 2, BAG_POUR = 1.75, CAN_POUR = 1.9;
/** 拉拉環時右手從右邊伸進來：畫面外的位置、手腕相對罐頭蓋子的位置 */
const R_SIDE = new Vector3(0.7, 0.3, 0.2), TAB_FROM = new Vector3(0.095, 0.06, 0.05);
// 手上的東西怎麼擺：東西的上方朝手的拇指側、厚度朝掌心，手掌朝內時東西就是直立的
const IN_RIGHT = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)));
const IN_LEFT = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0)));
const KINDS: CanKind[] = ["wet", "soup"];

/** drive：每一格問它現在的畫面（dt 是這一格過了幾秒） */
export function FeedScene({ drive }: { drive: (dt: number) => FeedFrame }) {
  const camera = useThree((s) => s.camera);
  const right = useRef<Group>(null), left = useRef<Group>(null), bag = useRef<Group>(null), bagMouth = useRef<Group>(null);
  const cans = { wet: useRef<Group>(null), soup: useRef<Group>(null) };
  const lids = { wet: useRef<Group>(null), soup: useRef<Group>(null) };
  const mouths = { wet: useRef<Group>(null), soup: useRef<Group>(null) };
  const chunk = useRef<Mesh>(null), stream = useRef<Mesh>(null);
  const food = useRef({ dry: 0, wet: false, soup: false }), pouring = useRef(false), lastCan = useRef<CanKind>("wet");
  const [rightPose, setRightPose] = useState<HandPose>("hold");
  const v = useMemo(() => ({ a: new Vector3(), b: new Vector3() }), []);

  useEffect(() => { camera.position.set(0, 0.58, 0.46); camera.lookAt(0, 0.05, -0.06); }, [camera]);

  useFrame((_, dt) => {
    const f = drive(Math.min(dt, 0.1));
    if (f.can) lastCan.current = f.can;
    const kind = lastCan.current;
    food.current = { dry: f.dry, wet: f.wet, soup: f.soup };
    pouring.current = f.pouring;

    // 左手：拿著罐頭進來、傾倒
    if (left.current) {
      left.current.visible = f.canIn > 0.01;
      left.current.position.lerpVectors(L_FAR, L_READY, f.canIn);
      left.current.rotation.set(0.2, -0.15, -SIDE - CAN_POUR * f.tilt);
    }
    for (const k of KINDS) {
      if (cans[k].current) cans[k].current!.visible = k === kind;
      if (lids[k].current) lids[k].current!.rotation.z = k === kind ? 2.3 * f.lid : 0;
    }

    // 右手：平常拿著飼料袋；開罐頭時先退出畫面，空手回來拉拉環
    const tab = f.can !== null && f.bagHand < 0.001;
    if (right.current) {
      if (tab) {
        lids[kind].current?.getWorldPosition(v.a);
        right.current.position.lerpVectors(R_SIDE, v.a.add(TAB_FROM).setY(v.a.y + 0.05 * f.lid), f.tabHand);
        right.current.rotation.set(-0.3, 1.1, Math.PI);  // 掌心朝下，手臂從右邊橫過來，指尖伸到拉環
      } else {
        right.current.position.lerpVectors(R_FAR, R_READY, f.bagHand);
        right.current.rotation.set(0.2, 0.15, SIDE + BAG_POUR * f.bagTilt);
      }
    }
    if (bag.current) bag.current.visible = !tab;
    if (tab !== (rightPose === "grip")) setRightPose(tab ? "grip" : "hold");

    // 罐頭的內容從罐口落到碗裡：主食罐是一坨、湯罐是一道液體
    const falling = f.drop > 0 && f.drop < 1 && mouths[kind].current;
    if (falling) mouths[kind].current!.getWorldPosition(v.a);
    if (chunk.current) {
      chunk.current.visible = Boolean(falling) && kind === "wet";
      if (chunk.current.visible) chunk.current.position.lerpVectors(v.a, BOWL_IN, f.drop * f.drop);
    }
    if (stream.current) {
      stream.current.visible = Boolean(falling) && kind === "soup";
      if (stream.current.visible) {
        const length = Math.max(0.001, v.a.y - BOWL_IN.y);
        stream.current.position.set(v.a.x, v.a.y - length / 2, v.a.z);
        stream.current.scale.set(1, length, 1);
      }
    }
  });

  const palm = HAND_POSES.hold.at[1];
  return <>
    <hemisphereLight intensity={1.7} color={0xffffff} groundColor={0xd8c0a0} />
    <directionalLight position={[1, 2, 1.5]} intensity={2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}><circleGeometry args={[0.9, 40]} /><meshStandardMaterial color={0xd9ccb6} roughness={0.9} /></mesh>
    <group position={BOWL_AT}>
      <WaterBowl water={0} />
      <BowlFood state={food} />
    </group>
    <KibbleFall from={bagMouth} on={pouring} toY={BOWL_IN.y} />

    <group ref={right} position={R_FAR}>
      <Suspense fallback={null}>
        <WaterHand id="water_hand_right" pose={rightPose}>
          <group ref={bag} position={[0, BAG.d / 2 - palm + 0.012, 0]} quaternion={IN_RIGHT}>
            <FeedBag />
            <group ref={bagMouth} position={[0, BAG.h / 2, 0]} />
          </group>
        </WaterHand>
      </Suspense>
    </group>
    <group ref={left} position={L_FAR} visible={false}>
      <Suspense fallback={null}>
        <WaterHand id="water_hand_left" pose="hold">
          {KINDS.map((k) => (
            <group key={k} ref={cans[k]} position={[0, CANS[k].r, 0]} quaternion={IN_LEFT} visible={false}>
              <FeedCan kind={k} lid={lids[k]} />
              <group ref={mouths[k]} position={[0, CANS[k].h / 2, 0]} />
            </group>
          ))}
        </WaterHand>
      </Suspense>
    </group>

    <mesh ref={chunk} visible={false} scale={[1, 0.7, 1]}><sphereGeometry args={[0.02, 16, 10]} /><meshStandardMaterial color={CANS.wet.food} roughness={0.75} /></mesh>
    <mesh ref={stream} visible={false}>
      <cylinderGeometry args={[0.006, 0.004, 1, 12]} />
      <meshStandardMaterial color={CANS.soup.food} transparent opacity={0.7} roughness={0.08} />
    </mesh>
  </>;
}
