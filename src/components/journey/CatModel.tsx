"use client";


import { useMemo } from "react";
import * as THREE from "three";

export const CAT_COLORS = {
  fur: "#f2a04e",
  stripe: "#d9792c",
  cream: "#fff3df",
  pink: "#f59ca5",
  eye: "#3b2a20",
  bowl: "#e8913a",
  kibble: "#9b5a2c",
};

/** Handles into the cat's skeleton, filled by callback refs and driven every frame. */
export type CatRig = {
  root: THREE.Group | null;
  hip: THREE.Group | null;
  head: THREE.Group | null;
  eyes: THREE.Group | null;
  tail: THREE.Group | null;
  haunches: THREE.Group | null;
  bowl: THREE.Group | null;
  tag: THREE.Group | null;
  /** Front-left, front-right, back-left, back-right. */
  legs: (THREE.Group | null)[];
};

export function emptyRig(): CatRig {
  return { root: null, hip: null, head: null, eyes: null, tail: null, haunches: null, bowl: null, tag: null, legs: [] };
}

function Mat({ color, ...rest }: { color: string; transparent?: boolean; opacity?: number; depthWrite?: boolean }) {
  return <meshStandardMaterial color={color} roughness={0.85} metalness={0} {...rest} />;
}

/** Hip pivot: the torso tilts around the back hips so the cat can sit. */
export const HIP = new THREE.Vector3(0, 0.55, -0.42);

function useShadowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(90,52,24,0.35)");
    grad.addColorStop(1, "rgba(90,52,24,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
}

function Leg({ rig, i, x, z }: { rig: CatRig; i: number; x: number; z: number }) {
  return (
    <group ref={(g) => void (rig.legs[i] = g)} position={[x, 0.72, z]}>
      <mesh position={[0, -0.3, 0]}>
        <capsuleGeometry args={[0.11, 0.42, 4, 12]} />
        <Mat color={CAT_COLORS.fur} />
      </mesh>
      <mesh position={[0, -0.6, 0.03]} scale={[1, 0.75, 1.2]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <Mat color={CAT_COLORS.cream} />
      </mesh>
    </group>
  );
}

function Tail({ rig }: { rig: CatRig }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.15, -0.35),
      new THREE.Vector3(0, 0.6, -0.55),
      new THREE.Vector3(0, 1.0, -0.42),
    ]);
    return new THREE.TubeGeometry(curve, 32, 0.09, 10, false);
  }, []);
  return (
    <group ref={(g) => void (rig.tail = g)} position={[0, 0.95, -0.72]}>
      <mesh geometry={geometry}>
        <Mat color={CAT_COLORS.fur} />
      </mesh>
      <mesh position={[0, 1.0, -0.42]}>
        <sphereGeometry args={[0.095, 12, 12]} />
        <Mat color={CAT_COLORS.stripe} />
      </mesh>
    </group>
  );
}

function Head({ rig }: { rig: CatRig }) {
  const C = CAT_COLORS;
  return (
    <group ref={(g) => void (rig.head = g)} position={[0, 1.28, 0.82]}>
      <group scale={0.62}>
        <mesh scale={[1.12, 0.95, 0.95]}>
          <sphereGeometry args={[0.78, 32, 32]} />
          <Mat color={C.fur} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.5, 0.6, -0.02]} rotation={[0, 0, -s * 0.38]}>
            <mesh>
              <coneGeometry args={[0.3, 0.55, 20]} />
              <Mat color={C.fur} />
            </mesh>
            <mesh position={[0, -0.04, 0.1]} scale={[0.6, 0.7, 0.5]}>
              <coneGeometry args={[0.3, 0.55, 20]} />
              <Mat color={C.pink} />
            </mesh>
          </group>
        ))}
        {[-0.17, 0, 0.17].map((x) => (
          <mesh key={x} position={[x, 0.5, 0.52]} rotation={[-0.75, 0, x * -1.2]}>
            <capsuleGeometry args={[0.035, x === 0 ? 0.2 : 0.14, 4, 8]} />
            <Mat color={C.stripe} />
          </mesh>
        ))}
        <group ref={(g) => void (rig.eyes = g)} position={[0, 0.06, 0]}>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.3, 0, 0.7]}>
              <mesh scale={[1, 1.2, 0.55]}>
                <sphereGeometry args={[0.13, 20, 20]} />
                <Mat color={C.eye} />
              </mesh>
              <mesh position={[0.04, 0.06, 0.06]}>
                <sphereGeometry args={[0.04, 12, 12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.12, -0.22, 0.66]}>
            <sphereGeometry args={[0.17, 20, 20]} />
            <Mat color={C.cream} />
          </mesh>
        ))}
        <mesh position={[0, -0.1, 0.78]} scale={[1.2, 0.85, 1]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <Mat color={C.pink} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.52, -0.14, 0.52]} scale={[1, 0.6, 0.4]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <Mat color={C.pink} transparent opacity={0.55} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Bowl({ rig }: { rig: CatRig }) {
  return (
    <group ref={(g) => void (rig.bowl = g)} position={[0, 0, 1.4]} scale={0}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.36, 0.28, 0.2, 32]} />
        <Mat color={CAT_COLORS.bowl} />
      </mesh>
      {[-0.12, 0, 0.12, -0.05, 0.07].map((x, i) => (
        <mesh key={i} position={[x, 0.22, (i % 2 ? 0.08 : -0.06)]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <Mat color={CAT_COLORS.kibble} />
        </mesh>
      ))}
    </group>
  );
}

export default function CatModel({
  rig,
  onPet,
  children,
}: {
  rig: CatRig;
  onPet: () => void;
  /** Rendered inside the root, e.g. the floating name tag. */
  children?: React.ReactNode;
}) {
  const shadow = useShadowTexture();
  const C = CAT_COLORS;

  return (
    <group
      ref={(g) => void (rig.root = g)}
      onClick={(e) => {
        e.stopPropagation();
        onPet();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.1]} scale={[2.2, 2.8, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>

      <Bowl rig={rig} />

      <group ref={(g) => void (rig.hip = g)} position={HIP.toArray()}>
        <group position={HIP.clone().negate().toArray()}>
          <mesh position={[0, 0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.42, 0.85, 8, 24]} />
            <Mat color={C.fur} />
          </mesh>
          <mesh position={[0, 0.72, 0.5]}>
            <sphereGeometry args={[0.32, 20, 20]} />
            <Mat color={C.cream} />
          </mesh>
          {[-0.2, 0.05, 0.3].map((z) => (
            <mesh key={z} position={[0, 1.26, z]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.04, 0.32, 4, 8]} />
              <Mat color={C.stripe} />
            </mesh>
          ))}
          {/* Haunches bulge out when sitting */}
          <group ref={(g) => void (rig.haunches = g)} scale={0}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.3, 0.55, -0.55]}>
                <sphereGeometry args={[0.36, 20, 20]} />
                <Mat color={C.fur} />
              </mesh>
            ))}
          </group>
          <Leg rig={rig} i={0} x={-0.22} z={0.45} />
          <Leg rig={rig} i={1} x={0.22} z={0.45} />
          <Leg rig={rig} i={2} x={-0.24} z={-0.42} />
          <Leg rig={rig} i={3} x={0.24} z={-0.42} />
          <Tail rig={rig} />
          <Head rig={rig} />
        </group>
      </group>

      <group ref={(g) => void (rig.tag = g)} position={[0, 2.3, 0]}>
        {children}
      </group>
    </group>
  );
}
