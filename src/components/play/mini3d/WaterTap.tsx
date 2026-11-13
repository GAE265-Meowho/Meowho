"use client";
// 虛擬飼養第 1 份：換水特寫的水龍頭（water_tap），用程式畫。家用單把手，把手是獨立的一塊，往上抬就是轉開、會出水。
// 原點在底座中心、貼著檯面；+Y 朝上，出水口和把手朝 +Z（朝使用者）。單位公尺。
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import { CatmullRomCurve3, Matrix4, Quaternion, Vector3, type Group, type Mesh } from "three";
import { HAND_POSES, handMirror, type HandId } from "./WaterHands";

/** 全開時把手抬起的角度（弧度） */
const OPEN_ANGLE = 0.5;
/** 全開時水柱的半徑 */
const STREAM_R = 0.006;
const HANDLE_Y = 0.128;
/** 握柄中心在把手裡的位置 */
const LEVER_AT = new Vector3(0, 0.022, 0.05);
/** 出水口相對水龍頭原點的位置 */
export const TAP_SPOUT: [number, number, number] = [0, 0.088, 0.14];
const SPOUT = new CatmullRomCurve3([[0, 0.075, 0.01], [0, 0.105, 0.06], [0, 0.108, 0.115], TAP_SPOUT].map((p) => new Vector3(...p)));
// 沒有環境貼圖，金屬感太高會整個變暗
const chrome = <meshStandardMaterial color={0xd4d8dc} metalness={0.3} roughness={0.25} />;

/** 手握在握柄上時，手的 group 在把手裡的位置和方向：掌心朝下、四指橫過握柄，手臂從手自己那一側伸進來 */
export function tapHold(id: HandId) {
  const m = handMirror(id), grip = HAND_POSES.grip.at;
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, m), new Vector3(0, -1, 0), new Vector3(m, 0, 0)));
  const position = LEVER_AT.clone().sub(new Vector3(grip[0] * m, grip[1], grip[2]).applyQuaternion(quaternion));
  return { position, quaternion };
}

/**
 * open：0 關、1 全開，放在 ref 裡每一格讀（動畫用，不重畫元件）；
 * drop：水從出水口往下流多長（公尺），依水槽深度或碗的高度調，也可以放 ref；
 * children 掛在把手底下，把手怎麼轉它都跟著（握著把手的手放這裡）。
 */
export function WaterTap({ open, drop, children }: { open: RefObject<number>; drop: RefObject<number>; children?: ReactNode }) {
  const handle = useRef<Group>(null);
  const stream = useRef<Mesh>(null);
  const spout = useMemo(() => SPOUT.clone(), []);

  useFrame(() => {
    const t = Math.min(1, Math.max(0, open.current ?? 0)), length = Math.max(0.001, drop.current ?? 0.25);
    if (handle.current) handle.current.rotation.x = -OPEN_ANGLE * t;
    if (stream.current) {
      stream.current.visible = t > 0.02;
      stream.current.scale.set(t, length, t);  // 開越大水柱越粗
      stream.current.position.set(TAP_SPOUT[0], TAP_SPOUT[1] - length / 2, TAP_SPOUT[2]);
    }
  });

  return <group>
    <mesh position={[0, 0.004, 0]}><cylinderGeometry args={[0.027, 0.029, 0.008, 32]} />{chrome}</mesh>
    <mesh position={[0, 0.068, 0]}><cylinderGeometry args={[0.021, 0.023, 0.12, 32]} />{chrome}</mesh>
    <mesh><tubeGeometry args={[spout, 24, 0.011, 16]} />{chrome}</mesh>
    <group ref={handle} position={[0, HANDLE_Y, 0]}>
      <mesh position={[0, 0.012, 0]}><cylinderGeometry args={[0.019, 0.022, 0.024, 32]} />{chrome}</mesh>
      <mesh position={LEVER_AT} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.011, 0.085, 4, 16]} />{chrome}</mesh>
      {children}
    </group>
    {/* shortcut: 水柱只是一條半透明的柱子，沒有水花和流動感；要更像水再換成會動的材質 */}
    <mesh ref={stream} visible={false}>
      <cylinderGeometry args={[STREAM_R, STREAM_R, 1, 12]} />
      <meshStandardMaterial color={0x8fc6d6} transparent opacity={0.6} roughness={0.1} />
    </mesh>
  </group>;
}
