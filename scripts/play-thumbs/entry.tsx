// 虛擬飼養採買畫面的縮圖（#354）：在 headless Chrome 裡把遊戲用的 3D 道具各畫一張透明底的圖，POST 回 render-play-thumbs.mjs。
// 用的是遊戲裡同一份元件（mini3d 的 FeedProps／ScoopProps／WaterProps）和同一個外出籠模型，燈光照 FeedScene／ScoopScene，所以跟遊戲裡看到的一致。
// 要多截一項：在 SHOTS 加一列，再跑 `node scripts/render-play-thumbs.mjs`。遠端 bucket 的模型（餐碗組、貓砂盆、逗貓老鼠）沙盒連不到，
// 之後在連得到的環境補截時，加 `{ name, glb: "<網址>" }` 即可。
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Box3, Vector3, type Group, type PerspectiveCamera } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BowlFood, FeedBag, FeedCan } from "@/components/play/mini3d/FeedProps";
import { LitterBox, ScoopShovel } from "@/components/play/mini3d/ScoopProps";
import { WaterBowl } from "@/components/play/mini3d/WaterProps";

const SIZE = 512;
/** 鏡頭方向（從右前上方看）；dir 可以每項覆寫 */
const DIR: [number, number, number] = [0.8, 0.75, 1.4];

function Glb({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  return <primitive object={gltf.scene} />;
}
function Can({ kind }: { kind: "wet" | "soup" }) {
  const lid = useRef<Group>(null);
  return <FeedCan kind={kind} lid={lid} />;
}
function Bowls() {
  const food = useRef({ dry: 55, wet: false, soup: false });
  return <group>
    <group position={[-0.08, 0, 0]}><WaterBowl /><BowlFood state={food} /></group>
    <group position={[0.08, 0, 0.02]}><WaterBowl water={0.8} /></group>
  </group>;
}

const SHOTS: { name: string; node: ReactNode; dir?: [number, number, number] }[] = [
  { name: "carrier", node: <Glb url="/play/cat_carrier.glb" />, dir: [1.2, 0.6, 1.2] },
  { name: "feed_bag", node: <FeedBag />, dir: [0.7, 0.4, 1.5] },
  { name: "feed_can", node: <Can kind="wet" /> },
  { name: "feed_can_soup", node: <Can kind="soup" /> },
  { name: "litter_box_open", node: <LitterBox kind="open" /> },
  { name: "litter_box_covered", node: <LitterBox kind="covered" /> },
  { name: "litter_box_large", node: <LitterBox kind="large" /> },
  { name: "litter_box_kitten", node: <LitterBox kind="kitten" /> },
  { name: "bowls", node: <Bowls />, dir: [0.3, 0.9, 1.4] },
  { name: "scoop", node: <ScoopShovel />, dir: [0.4, 1.2, 1] },
];

/** 等物件畫好 → 鏡頭對準、拉到剛好裝滿畫面 → 畫一格 → 送回去 */
function Shot({ name, dir, target, done }: { name: string; dir: [number, number, number]; target: React.RefObject<Group | null>; done: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let frames = 0, raf = 0;
    const tick = () => {
      if (++frames < 8 || !target.current) { raf = requestAnimationFrame(tick); return; }
      const cam = camera as PerspectiveCamera;
      const box = new Box3().setFromObject(target.current), c = box.getCenter(new Vector3()), r = box.getSize(new Vector3()).length() / 2;
      const d = new Vector3(...dir).normalize();
      let dist = r / Math.sin((cam.fov * Math.PI) / 360);
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      // 三輪：照八個角在畫面上的範圍，把中心移到正中、把距離調到佔畫面 86%
      for (let pass = 0; pass < 3; pass++) {
        cam.position.copy(c).addScaledVector(d, dist); cam.lookAt(c); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        const ndc = corners.map(p => p.clone().project(cam));
        const xs = ndc.map(p => p.x), ys = ndc.map(p => p.y);
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
        const mid = new Vector3((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, ndc[0].z).unproject(cam);
        const depth = c.clone().sub(cam.position).dot(d.clone().negate()), midDepth = mid.clone().sub(cam.position).dot(d.clone().negate());
        c.add(mid.sub(cam.position).multiplyScalar(depth / midDepth).add(cam.position).sub(c));
        dist *= span / 0.86;
      }
      cam.position.copy(c).addScaledVector(d, dist); cam.lookAt(c); cam.near = dist / 50; cam.far = dist * 10; cam.updateProjectionMatrix();
      gl.render(scene, cam);
      const png = gl.domElement.toDataURL("image/png");
      fetch(`/shot?name=${name}`, { method: "POST", body: png }).then(done);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gl, scene, camera, name, dir, target, done]);
  return null;
}

function One({ shot, done }: { shot: (typeof SHOTS)[number]; done: () => void }) {
  const target = useRef<Group>(null);
  return <div style={{ width: SIZE, height: SIZE }}>
    <Canvas dpr={1} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ fov: 22 }}>
      <hemisphereLight intensity={1.7} color={0xffffff} groundColor={0xd8c0a0} />
      <directionalLight position={[1, 2, 1.5]} intensity={2} />
      <Suspense fallback={null}>
        <group ref={target}>{shot.node}</group>
        <Shot name={shot.name} dir={shot.dir ?? DIR} target={target} done={done} />
      </Suspense>
    </Canvas>
  </div>;
}

function App() {
  const [n, setN] = useState(0);
  useEffect(() => { if (n >= SHOTS.length) fetch("/done", { method: "POST" }); }, [n]);
  return n < SHOTS.length ? <One key={SHOTS[n].name} shot={SHOTS[n]} done={() => setN(n + 1)} /> : null;
}

createRoot(document.getElementById("root")!).render(<App />);
