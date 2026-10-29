"use client";

// three.js objects are mutated imperatively in effects and the frame loop.
/* eslint-disable react-hooks/immutability */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useReducedMotion } from "@/lib/useReducedMotion";
import CatModel, { emptyRig } from "./CatModel";
import type { CatAction } from "./CatPerch";

type Perch = { el: HTMLElement; action: CatAction; label: string; range: number };
type RoamMode = "idle" | "walk" | "play" | "bed" | "sleep";

const roamLabels: Record<RoamMode, string> = {
  idle: "盯著你看",
  walk: "在中途貓屋散步",
  play: "追毛線球！",
  bed: "走去坐墊",
  sleep: "睡午覺 zZ",
};

/** Height of the cat model, in model units, used to size it in pixels. */
const CAT_HEIGHT = 2.2;

function readPerches(): Perch[] {
  return [...document.querySelectorAll<HTMLElement>("[data-cat-perch]")]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => ({
      el,
      action: el.dataset.catPerch as CatAction,
      label: el.dataset.catLabel ?? "",
      range: Number(el.dataset.catRange ?? 0),
    }));
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function smoothstep(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Pointer position across the whole window, normalised to -1..1. */
function useWindowPointer() {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return pointer;
}

type Brain = {
  offset: number;
  target: number;
  roam: RoamMode;
  until: number;
  heading: number;
  speed: number;
  phase: number;
  sit: number;
  sleep: number;
  eat: number;
  groom: number;
  hopStart: number;
  patrolDir: number;
  lastPet: number;
  petUntil: number;
  nextBlink: number;
  blinkUntil: number;
  ballOff: number;
  ballVel: number;
  ballShow: number;
  leg: number;
  legX: number;
  label: string;
};

function Journey({ onLabel, label, reducedMotion }: { onLabel: (s: string) => void; label: string; reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  // Events come from <body>, which would make drei mount the tag there (scrolling away);
  // keep it in the fixed canvas wrapper instead.
  const tagPortal = useMemo(() => ({ current: gl.domElement.parentElement as HTMLElement }), [gl]);
  const rig = useMemo(() => emptyRig(), []);
  const ball = useRef<THREE.Group>(null);
  const pointer = useWindowPointer();
  const perches = useRef<Perch[]>([]);
  const [petCount, setPetCount] = useState(0);

  const tmp = useMemo(
    () => ({ ndc: new THREE.Vector3(), dir: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), base: new THREE.Vector3(), roam: new THREE.Vector3(), axis: new THREE.Vector3() }),
    [],
  );

  const brain = useRef<Brain>({
    offset: 0,
    target: 0,
    roam: "idle",
    until: 1.5,
    heading: 0,
    speed: 0,
    phase: 0,
    sit: 0,
    sleep: 0,
    eat: 0,
    groom: 0,
    hopStart: -10,
    patrolDir: 1,
    lastPet: 0,
    petUntil: 0,
    nextBlink: 2,
    blinkUntil: 0,
    ballOff: 1.6,
    ballVel: 0,
    ballShow: 1,
    leg: -1,
    legX: 0,
    label: "",
  });

  // Perch list: re-read on resize (breakpoints can show/hide perches).
  useEffect(() => {
    const refresh = () => {
      perches.current = readPerches();
      invalidate();
    };
    const onScroll = () => invalidate();
    refresh();
    const t = window.setTimeout(refresh, 400);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", onScroll);
    };
  }, [invalidate]);

  useEffect(() => {
    camera.lookAt(0, 0, 0);
  }, [camera]);

  /** Viewport pixel → point on the z=0 plane. */
  const toWorld = (x: number, y: number, out: THREE.Vector3) => {
    tmp.ndc.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1, 0.5).unproject(camera);
    tmp.dir.copy(tmp.ndc).sub(camera.position).normalize();
    const d = -camera.position.z / tmp.dir.z;
    return out.copy(camera.position).addScaledVector(tmp.dir, d);
  };

  useFrame(({ clock }, rawDt) => {
    const list = perches.current;
    const root = rig.root;
    if (!root || list.length === 0) return;
    const b = brain.current;
    const dt = reducedMotion ? 0 : Math.min(rawDt, 0.05);
    const t = clock.getElapsedTime();

    // ---- Size: keep the cat a friendly pixel height on any screen ----
    const persp = camera as THREE.PerspectiveCamera;
    const dist = camera.position.length();
    const pxPerUnit = size.height / (2 * dist * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)));
    const targetPx = size.width < 768 ? 92 : THREE.MathUtils.clamp(size.height * 0.19, 110, 160);
    const s = targetPx / (pxPerUnit * CAT_HEIGHT);
    const pxToCat = 1 / (pxPerUnit * s);

    // ---- Where along the journey are we? ----
    const anchors = list.map((p) => {
      const r = p.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom };
    });
    const docH = document.documentElement.scrollHeight;
    const nearEnd = THREE.MathUtils.clamp((window.scrollY + size.height - (docH - size.height * 0.6)) / (size.height * 0.6), 0, 1);
    // A perch "arrives" when it rises to this line (pushed down near the page end
    // so the footer's perch can still arrive).
    const arrive = THREE.MathUtils.lerp(size.height * 0.8, size.height * 0.98, nearEnd);

    // i = the last perch that has arrived, j = the next one.
    let i = 0;
    while (i < anchors.length - 1 && anchors[i + 1].y <= arrive) i++;
    const j = Math.min(i + 1, list.length - 1);

    // Split the scroll between i arriving and j arriving into: stay at i → walk
    // out through the nearest edge → wait off-screen (long stretches such as the
    // pinned 三步通關) → walk in from the edge as j comes up. Works for any gap.
    let q = 0;
    if (j > i && anchors[i].y <= arrive) {
      const gap = Math.max(anchors[j].y - anchors[i].y, 1);
      const p = arrive - anchors[i].y;
      const stay = Math.min(size.height * 0.45, gap * 0.35);
      const out = Math.min(size.height * 0.3, gap * 0.3);
      const into = Math.min(size.height * 0.25, gap * 0.35);
      if (p <= stay) q = 0;
      else if (p <= stay + out) q = (0.5 * (p - stay)) / out;
      else if (p < gap - into) q = 0.5;
      else q = 0.5 + (0.5 * (p - (gap - into))) / into;
      q = THREE.MathUtils.clamp(q, 0, 1);
      if (reducedMotion) q = q < 0.75 ? 0 : 1;
    }
    const t2 = q;
    const offPx = targetPx * 1.3;
    const edgeFor = (x: number) => (x < size.width / 2 ? -offPx : size.width + offPx);
    const leaving = t2 < 0.5;
    const from = leaving ? anchors[i].x : edgeFor(anchors[j].x);
    const to = leaving ? edgeFor(anchors[i].x) : anchors[j].x;
    // Ease each leg so the cat sets off and arrives gently.
    const u = smoothstep(0, 1, leaving ? t2 / 0.5 : (t2 - 0.5) / 0.5);
    const sx = THREE.MathUtils.lerp(from, to, u);
    // Keep both legs on screen: the walk out and the walk in happen where the
    // visitor can see them, even if the perch row itself has scrolled away.
    const minY = (size.width < 768 ? 56 : 68) + targetPx + 28;
    const maxY = size.height - (size.width < 768 ? 84 : 16);
    const sy = THREE.MathUtils.clamp(leaving ? anchors[i].y : anchors[j].y, minY, maxY);
    toWorld(sx, sy, tmp.base);

    const traveling = t2 > 0.002 && t2 < 0.998;
    const current = leaving ? i : j;
    const perch = list[current];
    // Ranges are authored for desktop; never wander more than ~30% of the screen width.
    const rangePx = (p: Perch) => Math.min(p.range, size.width * 0.3);
    const range = rangePx(perch) * pxToCat;

    // Walking speed along the exit/entry leg, in cat units (page scroll itself is ignored).
    const leg = i * 2 + (leaving ? 0 : 1);
    let vx = 0;
    if (b.leg === leg && dt > 0) vx = ((sx - b.legX) / dt) * pxToCat;
    b.leg = leg;
    b.legX = sx;
    const legDir = Math.sign(to - from) || 1;

    // ---- Petting ----
    if (petCount !== b.lastPet) {
      b.lastPet = petCount;
      b.hopStart = t;
      b.petUntil = t + 2.2;
      if (b.roam === "sleep" || b.roam === "bed") {
        b.roam = "idle";
        b.until = t + 2.5;
      }
    }
    const petting = t < b.petUntil;

    // ---- Behaviour at the current perch ----
    let desiredHeading = pointer.current.x * 0.4;
    let moveSpeed = 0;
    let gallop = false;
    let wantSit = 0;
    let wantSleep = 0;
    let wantEat = 0;
    let wantGroom = 0;
    let roamLabel: string | null = null;
    const prevOffset = b.offset;

    const walkTo = (goal: number, speed: number) => {
      const d = goal - b.offset;
      if (Math.abs(d) < 0.05) return true;
      desiredHeading = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      // Turn first, then walk.
      const facing = Math.cos(angleDelta(b.heading, desiredHeading));
      b.offset += Math.sign(d) * Math.min(Math.abs(d), speed * Math.max(0, facing) * dt);
      return Math.abs(goal - b.offset) < 0.05;
    };

    if (traveling) {
      b.offset = THREE.MathUtils.lerp(b.offset, 0, 1 - Math.exp(-4 * dt));
      // Face the way it is walking; scrolling back up makes it walk back.
      const dir = Math.abs(vx) > 0.05 ? Math.sign(vx) : legDir;
      desiredHeading = (dir * Math.PI) / 2;
      moveSpeed = Math.min(Math.abs(vx), 4);
      gallop = Math.abs(vx) > 2.6;
    } else if (!reducedMotion) {
      switch (perch.action) {
        case "roam": {
          if (t > b.until && !petting) {
            const r = Math.random();
            if (r < 0.35) {
              b.roam = "walk";
              b.target = THREE.MathUtils.randFloat(-range, range);
              b.until = t + 8;
            } else if (r < 0.62) {
              b.roam = "play";
              b.until = t + 6;
            } else if (r < 0.85) {
              b.roam = "idle";
              b.until = t + 2 + Math.random() * 2;
            } else {
              b.roam = "bed";
              b.until = t + 10;
            }
          }
          if (b.roam === "walk" && walkTo(b.target, 0.95)) {
            b.roam = "idle";
            b.until = t + 1.5 + Math.random() * 2;
          } else if (b.roam === "play") {
            gallop = true;
            const side = Math.sign(b.ballOff - b.offset) || 1;
            if (walkTo(b.ballOff - side * 0.7, 3.2)) {
              b.ballVel = side * (2.5 + Math.random() * 2);
              b.hopStart = t;
              b.roam = Math.random() < 0.5 ? "play" : "idle";
              b.until = t + 1.5 + Math.random() * 2;
            }
          } else if (b.roam === "bed" && walkTo(0, 0.95)) {
            b.roam = "sleep";
            b.until = t + 7 + Math.random() * 4;
          } else if (b.roam === "sleep") {
            wantSleep = 1;
            desiredHeading = 0.5;
          }
          roamLabel = roamLabels[b.roam];
          break;
        }
        case "patrol": {
          if (t > b.until && walkTo(b.patrolDir * range, 0.9)) {
            b.patrolDir *= -1;
            b.until = t + 1.4;
          }
          break;
        }
        default: {
          // Stationary actions: get back to the perch first.
          if (walkTo(0, 1.2)) {
            if (perch.action === "sit" || perch.action === "think") wantSit = 1;
            if (perch.action === "groom") {
              wantSit = 1;
              wantGroom = 1;
            }
            if (perch.action === "sleep") {
              wantSleep = 1;
              desiredHeading = 0.5;
            }
            if (perch.action === "eat") {
              wantEat = 1;
              desiredHeading = 0;
            }
          }
        }
      }
    }

    if (!traveling && dt > 0) moveSpeed = Math.max(moveSpeed, Math.abs(b.offset - prevOffset) / dt);
    if (petting) {
      wantSleep = 0;
      desiredHeading = pointer.current.x * 0.4;
    }

    // ---- Yarn ball (only in the roaming room) ----
    const roamIdx = list.findIndex((p) => p.action === "roam");
    const ballWanted = !traveling && perch.action === "roam" ? 1 : 0;
    b.ballShow = reducedMotion ? ballWanted : THREE.MathUtils.lerp(b.ballShow, ballWanted, 1 - Math.exp(-5 * dt));
    if (ball.current && roamIdx >= 0) {
      const ra = anchors[roamIdx];
      toWorld(ra.x, ra.y, tmp.roam);
      b.ballOff += b.ballVel * dt;
      b.ballVel *= Math.exp(-1.4 * dt);
      const ballRange = rangePx(list[roamIdx]) * pxToCat;
      if (Math.abs(b.ballOff) > ballRange) {
        b.ballOff = Math.sign(b.ballOff) * ballRange;
        b.ballVel *= -0.6;
      }
      ball.current.position.set(tmp.roam.x + b.ballOff * s, tmp.roam.y + 0.2 * s, 0.2 * s);
      ball.current.scale.setScalar(s * b.ballShow);
      if (Math.abs(b.ballVel) > 0.01) {
        tmp.axis.set(0, 0, -Math.sign(b.ballVel));
        ball.current.rotateOnWorldAxis(tmp.axis, (Math.abs(b.ballVel) * dt) / 0.2);
      }
    }

    // ---- Heading & gait ----
    const k = 1 - Math.exp(-8 * dt);
    b.heading += angleDelta(b.heading, desiredHeading) * (reducedMotion ? 1 : k);
    b.speed = THREE.MathUtils.lerp(b.speed, moveSpeed, 1 - Math.exp(-6 * dt));
    b.phase += dt * (2 + b.speed * (gallop ? 3.4 : 5.5));
    const amp = Math.min(b.speed * 0.45, 0.85);
    const sw = Math.sin(b.phase);

    const blend = (cur: number, want: number, rate = 4) => (reducedMotion ? want : THREE.MathUtils.lerp(cur, want, 1 - Math.exp(-rate * dt)));
    b.sit = blend(b.sit, wantSit);
    b.sleep = blend(b.sleep, wantSleep, 3);
    b.eat = blend(b.eat, wantEat);
    b.groom = blend(b.groom, wantGroom);

    const hopP = (t - b.hopStart) / 0.45;
    const petHop = hopP < 1 ? Math.sin(hopP * Math.PI) * 0.4 : 0;
    const travelBob = traveling ? Math.abs(sw) * amp * 0.12 : 0;

    root.position.set(tmp.base.x + b.offset * s, tmp.base.y + (petHop + travelBob - b.sit * 0.1) * s, 0);
    root.scale.setScalar(s);
    root.rotation.y = b.heading;

    // ---- Pose ----
    const SIT = 0.55;
    if (rig.hip) {
      rig.hip.rotation.x = -b.sit * SIT + (gallop ? Math.sin(b.phase) * 0.1 * amp : 0);
      rig.hip.position.y = 0.55 - b.sleep * 0.5;
      rig.hip.scale.y = b.sleep > 0.5 && !reducedMotion ? 1 + Math.sin(t * 1.6) * 0.02 : 1;
    }
    if (rig.haunches) rig.haunches.scale.setScalar(b.sit);

    const swing = gallop ? [sw, Math.sin(b.phase + 0.5), -sw, -Math.sin(b.phase + 0.5)] : [sw, -sw, -sw, sw];
    rig.legs.forEach((leg, n) => {
      if (!leg) return;
      const front = n < 2;
      let rx = swing[n] * amp + b.sit * SIT; // keep legs vertical while the torso tilts
      let sy = 1 - b.sleep * 0.85;
      if (front) sy *= 1 + b.sit * 0.55;
      else sy *= 1 - b.sit * 0.55;
      // Groom: lift the front-right paw to the face.
      if (n === 1 && b.groom > 0) {
        rx = THREE.MathUtils.lerp(rx, -1.7 + Math.sin(t * 6) * 0.15, b.groom);
        sy = THREE.MathUtils.lerp(sy, 0.85, b.groom);
      }
      leg.rotation.x = rx;
      leg.scale.y = sy;
    });

    if (rig.head) {
      const look = !traveling && perch.action !== "patrol";
      const sinceHop = t - b.hopStart;
      let yaw = look ? pointer.current.x * 0.4 : 0;
      let pitch = look ? -pointer.current.y * 0.2 : 0.05;
      let roll = petting ? Math.sin(sinceHop * 6) * 0.15 : 0;
      if (perch.action === "think" && !traveling) roll += Math.sin(t * 1.3) * 0.28 * b.sit;
      // Eating: nose down into the bowl, bobbing.
      pitch = THREE.MathUtils.lerp(pitch, 0.75 + Math.sin(t * 5) * 0.08, b.eat);
      // Grooming: face turned down toward the raised paw.
      pitch = THREE.MathUtils.lerp(pitch, 0.4 + Math.sin(t * 6) * 0.08, b.groom);
      yaw = THREE.MathUtils.lerp(yaw, -0.35, b.groom);
      rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, pitch + b.sit * SIT * 0.85 + b.sleep * 0.35, reducedMotion ? 1 : 0.1);
      rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, yaw, reducedMotion ? 1 : 0.1);
      rig.head.rotation.z = THREE.MathUtils.lerp(rig.head.rotation.z, roll, reducedMotion ? 1 : 0.15);
      rig.head.position.y = 1.28 - b.sleep * 0.12 - b.eat * 0.28;
      rig.head.position.z = 0.82 + b.eat * 0.12;
    }

    if (rig.eyes) {
      if (t > b.nextBlink) {
        b.blinkUntil = t + 0.13;
        b.nextBlink = t + 2.5 + Math.random() * 3;
      }
      const closed = b.sleep > 0.5 ? 0.08 : petting ? 0.2 : t < b.blinkUntil ? 0.1 : 1;
      rig.eyes.scale.y = reducedMotion ? closed : THREE.MathUtils.lerp(rig.eyes.scale.y, closed, 0.35);
    }

    if (rig.tail) {
      const swayT = reducedMotion ? 0 : Math.sin(t * (gallop ? 6 : 2)) * (gallop ? 0.15 : 0.35);
      rig.tail.rotation.y = THREE.MathUtils.lerp(swayT, 0.6, b.sleep);
      rig.tail.rotation.z = THREE.MathUtils.lerp(0, 1.45, b.sleep);
      rig.tail.rotation.x = THREE.MathUtils.lerp(gallop ? 0.6 : 0, 0.2, b.sleep) + b.sit * 0.9;
    }

    if (rig.bowl) rig.bowl.scale.setScalar(b.eat);
    if (rig.tag) rig.tag.position.y = 2.3 - b.sleep * 0.7 - b.sit * 0.1;

    // ---- Name tag ----
    const text = petting ? "呼嚕呼嚕～" : traveling ? "走去下一站" : roamLabel ?? perch.label;
    if (text !== b.label) {
      b.label = text;
      onLabel(text);
    }
  });

  return (
    <>
      <CatModel rig={rig} onPet={() => setPetCount((n) => n + 1)}>
        <Html center portal={tagPortal} zIndexRange={[45, 41]} style={{ pointerEvents: "none" }}>
          <span className="cat-tag">橘子・{label}</span>
        </Html>
      </CatModel>
      <group ref={ball} scale={0}>
        <mesh>
          <sphereGeometry args={[0.2, 24, 24]} />
          <meshStandardMaterial color="#e9767a" roughness={0.85} />
        </mesh>
        {[0, 1.1, 2.2].map((r) => (
          <mesh key={r} rotation={[r, r * 0.7, 0]}>
            <torusGeometry args={[0.2, 0.012, 6, 32]} />
            <meshStandardMaterial color="#d55a60" roughness={0.85} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/**
 * 橘子, one 3D cat for the whole page. It walks from perch to perch as the
 * visitor scrolls and does each section's activity once it arrives.
 */
export default function CatJourney() {
  const reducedMotion = useReducedMotion();
  const [label, setLabel] = useState("");

  return (
    <Canvas
      style={{ position: "fixed", inset: 0, zIndex: 40, pointerEvents: "none" }}
      eventSource={document.body}
      eventPrefix="client"
      dpr={[1, 2]}
      camera={{ position: [0, 4, 20], fov: 25 }}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{ alpha: true, antialias: true }}
    >
      <hemisphereLight args={["#fff6e8", "#f3d9bb", 1.15]} />
      <directionalLight position={[4, 8, 6]} intensity={1.5} color="#fff1dc" />
      <directionalLight position={[-5, 3, 4]} intensity={0.4} color="#ffd6e0" />
      <Journey onLabel={setLabel} label={label} reducedMotion={reducedMotion} />
    </Canvas>
  );
}

