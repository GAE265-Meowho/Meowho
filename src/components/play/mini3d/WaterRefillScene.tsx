"use client";
// 虛擬飼養第 1 份：換水特寫的六格動作（第一視角）。右手拿水碗、倒掉舊水、接到出水口下，左手開關水龍頭。
// 每個時間點的數值在 lib/play/mini3d/refill-timeline.ts；這裡只負責把數值擺成畫面。放在 <Canvas> 裡用。
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import { MathUtils, Vector3, type Group, type Mesh } from "three";
import { REFILL_SECONDS, refillAt, type RefillFrame } from "@/lib/play/mini3d/refill-timeline";
import { WaterHand } from "./WaterHands";
import { BOWL, SINK, WaterBowl, WaterSink } from "./WaterProps";
import { TAP_SPOUT, tapHold, WaterTap } from "./WaterTap";

/** 水龍頭在水槽後緣，出水口伸到水槽上方 */
const TAP_AT = new Vector3(0, 0, -0.26);
const SPOUT_Y = TAP_AT.y + TAP_SPOUT[1];
// 右手手腕的三個位置：畫面外、水槽前方、碗在出水口下
const FAR = new Vector3(0.3, 0.0, 0.62), FRONT = new Vector3(0.12, 0.07, 0.19), UNDER = new Vector3(0.035, -0.03, -0.04);
// 對應的手腕角度 [往下壓, 往內轉]：水槽前方手肘在下、出水口下手肘抬高才不會穿過檯面
const FRONT_TURN = [0.3, 0.3], UNDER_TURN = [-0.22, 0.12];
/** 倒水時手腕往左翻多少（弧度）：往左倒，鏡頭才看得到水流 */
const POUR_ANGLE = 1.3;
/** 左手還沒握到把手時，離握的位置多遠（從左下方伸進來） */
const LEFT_AWAY = new Vector3(-0.32, -0.12, 0.42);
const LEFT_HOLD = tapHold("water_hand_left");
/** 碗左緣（倒水時水流出來的地方）在碗裡的位置 */
const LIP: [number, number, number] = [-BOWL.radius + 0.004, BOWL.height, 0];

/**
 * playKey 變了就從頭播；at 有給就停在那一秒（預覽、截圖用）；onStep 回報現在是第幾格；
 * drive 有給就不照時間軸，每一格問它現在的畫面（遊戲用，dt 是這一格過了幾秒）
 */
export function WaterRefillScene({ playKey = 0, at, onStep, drive }: { playKey?: number; at?: number; onStep?: (step: number) => void; drive?: (dt: number) => RefillFrame }) {
  const camera = useThree((s) => s.camera);
  const time = useRef(0);
  const right = useRef<Group>(null), left = useRef<Group>(null), lip = useRef<Group>(null), bowl = useRef<Group>(null), oldStream = useRef<Mesh>(null);
  const open = useRef(0), drop = useRef(SPOUT_Y + SINK.depth);
  // 水碗是照 props 畫的元件：水位每變 2% 才重畫一次
  const [view, setView] = useState({ step: 0, water: 0, dirty: true, pose: "cradle" as "cradle" | "rim" });

  useEffect(() => { camera.position.set(0, 0.46, 0.52); camera.lookAt(0, -0.03, -0.1); }, [camera]);
  useEffect(() => { time.current = 0; }, [playKey]);
  useEffect(() => { onStep?.(view.step); }, [onStep, view.step]);

  useFrame((_, dt) => {
    time.current = at ?? Math.min(REFILL_SECONDS, time.current + Math.min(dt, 0.1));
    const f = drive ? drive(Math.min(dt, 0.1)) : refillAt(time.current);

    if (right.current) {
      right.current.position.lerpVectors(FAR, FRONT, f.near).lerp(UNDER, f.under);
      right.current.rotation.set(
        MathUtils.lerp(FRONT_TURN[0], UNDER_TURN[0], f.under),
        MathUtils.lerp(FRONT_TURN[1], UNDER_TURN[1], f.under),
        POUR_ANGLE * f.tilt);
    }
    if (left.current) {
      left.current.visible = f.leftReach > 0.01;
      left.current.position.copy(LEFT_AWAY).multiplyScalar(1 - f.leftReach);
    }
    open.current = f.open;

    // 新水的水柱：碗在出水口下就流到水面，不然流到水槽底
    const bowlY = bowl.current?.getWorldPosition(new Vector3()).y ?? 0;
    drop.current = f.under > 0.95 ? SPOUT_Y - (bowlY + BOWL.floor + (BOWL.height - BOWL.floor) * f.water * 0.9) : SPOUT_Y + SINK.depth;

    // 舊水：從碗左緣直直流到水槽底
    if (oldStream.current && lip.current) {
      const from = lip.current.getWorldPosition(new Vector3()), length = from.y + SINK.depth;
      oldStream.current.visible = f.pouring && length > 0;
      oldStream.current.position.set(from.x, from.y - length / 2, from.z);
      oldStream.current.scale.set(1, Math.max(length, 0.001), 1);
    }

    const water = Math.round(f.water * 50) / 50;
    if (f.step !== view.step || water !== view.water || f.dirty !== view.dirty || f.rightPose !== view.pose) setView({ step: f.step, water, dirty: f.dirty, pose: f.rightPose });
  });

  return <>
    <hemisphereLight intensity={1.6} color={0xffffff} groundColor={0xd8c0a0} />
    <directionalLight position={[1, 2, 1.5]} intensity={2} />
    <WaterSink />
    <group position={TAP_AT}>
      <WaterTap open={open} drop={drop}>
        <group ref={left} visible={false}>
          <group position={LEFT_HOLD.position} quaternion={LEFT_HOLD.quaternion}>
            <Suspense fallback={null}><WaterHand id="water_hand_left" pose="grip" /></Suspense>
          </group>
        </group>
      </WaterTap>
    </group>
    <group ref={right} position={FAR}>
      <Suspense fallback={null}>
        <WaterHand id="water_hand_right" pose={view.pose}>
          <group ref={bowl}>
            <WaterBowl water={view.water} dirty={view.dirty} />
            <group ref={lip} position={LIP} />
          </group>
        </WaterHand>
      </Suspense>
    </group>
    <mesh ref={oldStream} visible={false}>
      <cylinderGeometry args={[0.007, 0.005, 1, 12]} />
      <meshStandardMaterial color={0xb9b08a} transparent opacity={0.75} roughness={0.2} />
    </mesh>
  </>;
}
