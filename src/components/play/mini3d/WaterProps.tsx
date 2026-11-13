"use client";
// 虛擬飼養第 1 份：換水特寫用的道具，用程式畫（不載模型）。尺寸是公尺，原點在底部中心。
//   WaterBowl（water_bowl）：和餐碗組同色的圓碗，直徑 14 公分、高 5 公分，碗內是凹的
//   WaterSink（water_sink）：檯面上的橢圓水槽，內徑 50 × 40 公分、深 15 公分，原點在檯面高度的中心
import { useMemo } from "react";
import { Color, DoubleSide, LatheGeometry, Path, Shape, ShapeGeometry, Vector2 } from "three";

// 顏色照房間裡的餐碗組模型（meow-items/test_bowls_…/model.glb 的材質 cream、water，glTF 的線性色值）
const BOWL_COLOR = new Color().setRGB(0.85, 0.78, 0.63);
const WATER_COLOR = new Color().setRGB(0.4, 0.64, 0.72);
/** 水槽、檯面不上色，一律中性白 */
const SINK_COLOR = 0xf2f2f2;

export const BOWL = { radius: 0.07, height: 0.05, /** 碗內底離碗底多高 */ floor: 0.008, /** 碗內底的半徑 */ innerBase: 0.042 };
export const SINK = { rx: 0.25, rz: 0.2, depth: 0.15, counter: [0.9, 0.6] as const };

/** 剖面沿 Y 軸轉一圈：外壁往上、碗口收圓、內壁往下到碗內底 */
const bowlProfile = [
  [0, 0], [0.045, 0], [0.052, 0.004], [0.062, 0.022], [0.068, 0.042], [0.07, 0.05],  // 底、外壁
  [0.068, 0.052], [0.065, 0.05],                                                      // 碗口
  [0.061, 0.034], [0.052, 0.015], [BOWL.innerBase, BOWL.floor], [0, BOWL.floor],      // 內壁、內底
].map(([r, y]) => new Vector2(r, y));

/** water：0～1 的水位，0 不畫水；dirty：舊水的顏色 */
export function WaterBowl({ water = 0, dirty = false }: { water?: number; dirty?: boolean }) {
  const geometry = useMemo(() => new LatheGeometry(bowlProfile, 48), []);
  const level = Math.min(1, Math.max(0, water));
  // 水面跟著內壁變寬：內底半徑 → 接近碗口
  const r = BOWL.innerBase + (0.064 - BOWL.innerBase) * level;
  return <group>
    <mesh geometry={geometry}>
      <meshStandardMaterial color={BOWL_COLOR} roughness={0.92} side={DoubleSide} />
    </mesh>
    {level > 0.02 && (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BOWL.floor + (BOWL.height - BOWL.floor - 0.006) * level, 0]}>
        <circleGeometry args={[r, 40]} />
        <meshStandardMaterial color={dirty ? 0xb9b08a : WATER_COLOR} transparent opacity={0.85} roughness={0.15} />
      </mesh>
    )}
  </group>;
}

const sinkProfile = [
  [1, 0], [0.97, -0.02], [0.93, -0.1], [0.85, -0.14], [0.6, -SINK.depth], [0.12, -SINK.depth],  // 盆口往下到盆底（半徑用 0～1，之後縮放成橢圓）
].map(([r, y]) => new Vector2(r, y));

export function WaterSink() {
  const basin = useMemo(() => new LatheGeometry(sinkProfile, 56), []);
  // 檯面：長方形挖掉橢圓的盆口
  const counter = useMemo(() => {
    const [w, d] = SINK.counter;
    const shape = new Shape().moveTo(-w / 2, -d / 2).lineTo(w / 2, -d / 2).lineTo(w / 2, d / 2).lineTo(-w / 2, d / 2).closePath();
    shape.holes.push(new Path().absellipse(0, 0, SINK.rx, SINK.rz, 0, Math.PI * 2, true));
    return new ShapeGeometry(shape, 48);
  }, []);
  return <group>
    <mesh geometry={counter} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={SINK_COLOR} roughness={0.6} />
    </mesh>
    <mesh geometry={basin} scale={[SINK.rx, 1, SINK.rz]}>
      <meshStandardMaterial color={SINK_COLOR} roughness={0.3} side={DoubleSide} />
    </mesh>
    {/* 排水孔 */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -SINK.depth + 0.001, 0]}>
      <circleGeometry args={[0.03, 24]} />
      <meshStandardMaterial color={0x8a8a8a} metalness={0.6} roughness={0.4} />
    </mesh>
  </group>;
}
