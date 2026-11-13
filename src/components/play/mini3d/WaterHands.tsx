"use client";
// 虛擬飼養第 1 份：換水、餵貓特寫的兩隻手（第一視角）。
//   water_hand_right：右手，托碗（cradle）、握碗緣（rim）、握飼料袋（hold）、拉罐頭拉環（grip）
//   water_hand_left：左手，握水龍頭把手（grip）、握罐頭（hold）
// 模型是從 CC0 的 VRM 替身切出來的前臂和手（public/play/water_hand.license.txt），骨架保留，手勢在這裡套。
// 這個 group 的原點在手腕，-Z 是指尖方向，+Y 是掌心朝的方向；右手拇指在 +X 那側，左手是鏡像。
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import { MathUtils, Matrix4, Quaternion, Vector3, type Bone, type Group, type Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

export type HandId = "water_hand_right" | "water_hand_left";
export type HandPose = "cradle" | "rim" | "grip" | "hold";

const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const;
const FLAT = [0.1, 0.15, 0.1], WRAP = [0.15, 0.4, 0.3], FIST = [1.2, 1.5, 0.9], HALF = [0.45, 0.55, 0.35];
/** curl：每根手指三節往掌心彎的角度（弧度），順序同 FINGERS；at：手上的東西相對手腕的位置（右手，左手 x 反過來） */
export const HAND_POSES: Record<HandPose, { curl: number[][]; at: [number, number, number] }> = {
  // 托住：碗底坐在掌心，四指微彎包著碗壁，拇指往外張
  cradle: { curl: [[-0.25, 0, 0], WRAP, WRAP, WRAP, WRAP], at: [-0.012, 0.016, -0.078] },
  // 握碗緣：四指平伸墊在碗底，拇指勾住靠近自己的碗緣
  rim: { curl: [[0.6, 0.2, 0.4], FLAT, FLAT, FLAT, FLAT], at: [0.01, 0.015, -0.135] },
  // 握把手：四指捲起來包住橫在掌心的把手
  grip: { curl: [[0.4, 0.5, 0.6], FIST, FIST, FIST, FIST], at: [0, 0.03, -0.105] },
  // 握著：手掌貼著東西的側面，四指半彎扣住（飼料袋、罐頭）；at 是手掌貼住的那個點
  hold: { curl: [[0.2, 0.2, 0.2], HALF, HALF, HALF, HALF], at: [0, 0.012, -0.085] },
};
/** 袖口離手腕多遠、袖子多長（公尺） */
const SLEEVE_FROM = 0.16, SLEEVE_LENGTH = 0.6;
/** 左手是右手的鏡像：x 方向反過來 */
export const handMirror = (id: HandId) => (id === "water_hand_left" ? -1 : 1);

const findBone = (root: Object3D, name: string) => {
  let hit: Object3D | undefined;
  root.traverse((o) => { if ((o as Bone).isBone && o.name.endsWith(name)) hit = o; });
  if (!hit) throw new Error(`手的模型少了骨頭 ${name}`);
  return hit;
};

/** children 會放在「手上拿的東西」的位置（跟著手勢換位置）；pose 改了會順順地過去 */
export function WaterHand({ id, pose, children }: { id: HandId; pose: HandPose; children?: ReactNode }) {
  const { scene } = useGLTF(`/play/${id}.glb`);
  const side = id === "water_hand_left" ? "Left" : "Right";
  const mirror = handMirror(id);
  const held = useRef<Group>(null);
  const curl = useRef<number[][] | null>(null);

  const { model, bones } = useMemo(() => {
    const m = clone(scene);
    m.traverse((o) => { o.frustumCulled = false; });  // 骨架動過之後原本的包圍盒不準
    m.updateMatrixWorld(true);
    // 用 T-pose 的骨頭位置算出手的方向，把整個模型轉到「手腕在原點、指尖朝 -Z、掌心朝 +Y」
    const at = (n: string) => findBone(m, side + n).getWorldPosition(new Vector3());
    const wrist = at("Hand"), fwd = at("HandMiddle1").sub(wrist).normalize();
    const palm = new Vector3().crossVectors(fwd, at("HandIndex1").sub(at("HandPinky1")).normalize()).normalize();
    if (palm.y > 0) palm.negate();  // T-pose 掌心朝下
    const back = fwd.clone().negate();
    m.applyMatrix4(new Matrix4().makeBasis(new Vector3().crossVectors(palm, back).normalize(), palm, back).setPosition(wrist).invert());
    const list = FINGERS.map((f) => [1, 2, 3].map((i) => {
      const bone = findBone(m, `${side}Hand${f}${i}`);
      return { bone, rest: bone.quaternion.clone() };
    }));
    return { model: m, bones: list };
  }, [scene, side]);

  useFrame((_, dt) => {
    const target = HAND_POSES[pose];
    const now = curl.current ??= target.curl.map((c) => [...c]);
    const k = 1 - Math.exp(-12 * Math.min(dt, 0.1));  // 手勢約 0.2 秒換完
    // mixamo 骨架：右手手指繞 -Z 往掌心彎，左手是鏡像
    const axis = new Vector3(0, 0, -mirror), turn = new Quaternion();
    bones.forEach((finger, f) => finger.forEach(({ bone, rest }, i) => {
      now[f][i] = MathUtils.lerp(now[f][i], target.curl[f][i], k);
      bone.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis, now[f][i]));
    }));
    held.current?.position.lerp(new Vector3(target.at[0] * mirror, target.at[1], target.at[2]), k);
  });

  const start = HAND_POSES[pose].at;
  return <group>
    <primitive object={model} />
    {/* 袖子：模型只到手肘，接一截袖子出去，手臂才不會在畫面裡斷掉 */}
    <mesh position={[0, 0, SLEEVE_FROM + SLEEVE_LENGTH / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <capsuleGeometry args={[0.043, SLEEVE_LENGTH, 4, 16]} />
      <meshStandardMaterial color={0x9fb3c2} roughness={0.9} />
    </mesh>
    <group ref={held} position={[start[0] * mirror, start[1], start[2]]}>{children}</group>
  </group>;
}

useGLTF.preload("/play/water_hand_right.glb");
useGLTF.preload("/play/water_hand_left.glb");
