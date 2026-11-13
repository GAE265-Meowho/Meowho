"use client";
// 虛擬飼養第 1 份：餵貓特寫用的道具，用程式畫（不載模型）。尺寸是公尺，原點在物件中心。
//   FeedBag（feed_bag）：乾飼料袋
//   FeedCan（feed_can）：罐頭，kind="wet" 主食罐（矮胖）、"soup" 湯罐（瘦高）；都有拉環，蓋子可以掀開
//   BowlFood：碗裡的東西——乾飼料是一顆一顆的顆粒堆、主食罐是一坨濕食、湯罐是半透明的液體
//   KibbleFall：從袋口落下的飼料顆粒
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { Matrix4, Object3D, Vector3, type Group, type InstancedMesh, type Mesh } from "three";
import type { FeedCan as CanKind } from "@/lib/play/mini3d/feed-rules";
import { BOWL } from "./WaterProps";

export const BAG = { w: 0.12, h: 0.18, d: 0.05 };
export const CANS: Record<CanKind, { r: number; h: number; color: number; food: number }> = {
  wet: { r: 0.037, h: 0.045, color: 0x3fa7a0, food: 0xc98b6b },
  soup: { r: 0.027, h: 0.065, color: 0xd98a5f, food: 0xe0b45c },
};
const KIBBLE = 0xa9743f, KIBBLE_R = 0.0045;

export function FeedBag() {
  return <group>
    <mesh><boxGeometry args={[BAG.w, BAG.h, BAG.d]} /><meshStandardMaterial color={0xe8a33d} roughness={0.8} /></mesh>
    {/* 袋口的封條、正面的圓標 */}
    <mesh position={[0, BAG.h / 2 - 0.012, 0]}><boxGeometry args={[BAG.w + 0.004, 0.024, BAG.d + 0.004]} /><meshStandardMaterial color={0xb5791f} roughness={0.8} /></mesh>
    <mesh position={[0, -0.01, BAG.d / 2 + 0.001]}><circleGeometry args={[0.032, 24]} /><meshStandardMaterial color={0xf7d9a6} roughness={0.9} /></mesh>
  </group>;
}

/** lid：蓋子那一塊，掀開由外面轉它（繞靠手那一側的邊） */
export function FeedCan({ kind, lid }: { kind: CanKind; lid: RefObject<Group | null> }) {
  const c = CANS[kind];
  return <group>
    <mesh><cylinderGeometry args={[c.r, c.r, c.h, 32]} /><meshStandardMaterial color={c.color} roughness={0.5} metalness={0.2} /></mesh>
    {/* 罐子裡的東西：蓋子掀開才看得到 */}
    <mesh position={[0, c.h / 2 + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[c.r * 0.92, 32]} />
      <meshStandardMaterial color={c.food} roughness={kind === "soup" ? 0.1 : 0.9} />
    </mesh>
    <group ref={lid} position={[-c.r, c.h / 2 + 0.001, 0]}>
      <mesh position={[c.r, 0.001, 0]}><cylinderGeometry args={[c.r, c.r, 0.002, 32]} /><meshStandardMaterial color={0xd9dde0} metalness={0.5} roughness={0.3} /></mesh>
      {/* 拉環 */}
      <mesh position={[c.r * 1.35, 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[c.r * 0.32, 0.0022, 8, 20]} /><meshStandardMaterial color={0xb8bec4} metalness={0.5} roughness={0.3} /></mesh>
    </group>
  </group>;
}

/** 固定的亂數：每次畫出來顆粒位置都一樣 */
const scatter = (n: number) => Array.from({ length: n }, (_, i) => {
  const a = i * 2.399963, f = Math.sqrt((i + 0.5) / n);  // 金角螺旋，平均鋪滿圓面
  return { a, f };
});

/** state.current：碗裡的乾飼料量（0～100）、有沒有主食罐、有沒有湯罐。放在水碗（WaterBowl water={0}）裡面。 */
export function BowlFood({ state }: { state: RefObject<{ dry: number; wet: boolean; soup: boolean }> }) {
  const mound = useRef<Mesh>(null), bits = useRef<InstancedMesh>(null), wet = useRef<Group>(null), soup = useRef<Mesh>(null);
  const spots = useMemo(() => scatter(60), []);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame(() => {
    const s = state.current;
    const level = Math.min(1, s.dry / 100);
    // 顆粒堆：越多越寬、越高，中間鼓起來
    const r = BOWL.innerBase * 0.55 + (0.058 - BOWL.innerBase * 0.55) * Math.min(1, level * 1.6), high = 0.004 + 0.034 * level;
    if (mound.current) { mound.current.visible = s.dry > 0.5; mound.current.scale.set(r, high, r); }
    if (bits.current) {
      bits.current.visible = s.dry > 0.5;
      spots.forEach(({ a, f }, i) => {
        dummy.position.set(Math.cos(a) * f * r, BOWL.floor + high * Math.sqrt(1 - f * f * 0.95) + KIBBLE_R * 0.4, Math.sin(a) * f * r);
        dummy.rotation.set(a, a * 2, 0);
        dummy.updateMatrix();
        bits.current!.setMatrixAt(i, dummy.matrix);
      });
      bits.current.instanceMatrix.needsUpdate = true;
    }
    const top = BOWL.floor + (s.dry > 0.5 ? high : 0);
    if (wet.current) { wet.current.visible = s.wet; wet.current.position.y = top; }
    // 湯是液體：一圈半透明的水面，淹到顆粒堆的一半
    if (soup.current) { soup.current.visible = s.soup; soup.current.position.y = BOWL.floor + 0.004 + (s.dry > 0.5 ? high * 0.5 : 0); soup.current.scale.setScalar(BOWL.innerBase + 0.008 + 0.012 * level); }
  });

  return <group>
    <mesh ref={mound} position={[0, BOWL.floor, 0]} visible={false}>
      <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={0x96652f} roughness={1} />
    </mesh>
    <instancedMesh ref={bits} args={[undefined, undefined, spots.length]} visible={false}>
      <cylinderGeometry args={[KIBBLE_R, KIBBLE_R, KIBBLE_R * 0.9, 8]} />
      <meshStandardMaterial color={KIBBLE} roughness={0.9} />
    </instancedMesh>
    {/* 主食罐：一坨濕食疊在最上面 */}
    <group ref={wet} visible={false}>
      {[[0, 0.006, 0, 0.024], [0.016, 0.004, 0.008, 0.016], [-0.012, 0.004, -0.012, 0.015]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} scale={[1, 0.5, 1]}><sphereGeometry args={[r, 16, 10]} /><meshStandardMaterial color={CANS.wet.food} roughness={0.75} /></mesh>
      ))}
    </group>
    <mesh ref={soup} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <circleGeometry args={[1, 40]} />
      <meshStandardMaterial color={CANS.soup.food} transparent opacity={0.6} roughness={0.08} />
    </mesh>
  </group>;
}

const FALL_N = 36, GRAVITY = 9.8;

/** from：袋口（顆粒從這裡掉出來）；on.current：現在有沒有在倒；toY：掉到這個高度就消失（碗裡的高度）。放在場景最外層（世界座標）。 */
export function KibbleFall({ from, on, toY }: { from: RefObject<Object3D | null>; on: RefObject<boolean>; toY: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const parts = useRef(Array.from({ length: FALL_N }, () => ({ age: -1, x: 0, y: 0, z: 0 })));
  const next = useRef(0), clock = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);
  const at = useMemo(() => new Vector3(), []);
  const hidden = useMemo(() => new Matrix4().makeScale(0, 0, 0), []);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1), m = mesh.current;
    if (!m) return;
    clock.current += dt;
    // 每 0.012 秒掉一顆，位置在袋口附近散開
    if (on.current && from.current) {
      from.current.getWorldPosition(at);
      while (clock.current > 0.012) {
        clock.current -= 0.012;
        const p = parts.current[next.current++ % FALL_N], a = next.current * 2.399963;
        Object.assign(p, { age: 0, x: at.x + Math.cos(a) * 0.012, y: at.y, z: at.z + Math.sin(a) * 0.012 });
      }
    } else clock.current = 0;
    parts.current.forEach((p, i) => {
      if (p.age >= 0) p.age += dt;
      const y = p.y - 0.5 * GRAVITY * p.age * p.age;
      if (p.age < 0 || y < toY) { p.age = -1; m.setMatrixAt(i, hidden); return; }
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(p.age * 9, i, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[undefined, undefined, FALL_N]} frustumCulled={false}>
    <cylinderGeometry args={[KIBBLE_R, KIBBLE_R, KIBBLE_R * 0.9, 8]} />
    <meshStandardMaterial color={KIBBLE} roughness={0.9} />
  </instancedMesh>;
}
