"use client";
// 生活用品選單縮圖（#197）：把 .glb 拍成透明底 PNG；構圖讓整件道具 100% 落在格子裡（遊戲道具格）。
import { Canvas, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

/** key 加版本：構圖改了舊快取就不能再用 */
const cache = new Map<string, string>();
const CACHE_VER = "fit2";
const cacheKey = (url: string) => `${CACHE_VER}:${url}`;
/** 道具在畫面裡最多佔視角的比例，留邊距避免裁切 */
const FIT = 0.72;

function Model({ url, onReady }: { url: string; onReady: () => void }) {
  const { scene } = useGLTF(url);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const prepared = useMemo(() => {
    const m = scene.clone(true);
    m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z, 1e-4);
    // 先縮到單位大小；真正入框由相機距離決定
    const scale = 1 / max;
    m.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    m.scale.setScalar(scale);
    return m;
  }, [scene]);
  useEffect(() => { readyRef.current(); }, [prepared]);
  return <group userData={{ meowThumbModel: true }}><primitive object={prepared} /></group>;
}

function Snap({ ready, onShot }: { ready: boolean; onShot: (dataUrl: string) => void }) {
  const { gl, scene, camera } = useThree();
  const shotRef = useRef(onShot);
  shotRef.current = onShot;
  useEffect(() => {
    if (!ready) return;
    // 只量模型外框，把相機拉到「整件入鏡」
    let model: THREE.Object3D | null = null;
    scene.traverse(o => { if (!model && o.userData?.meowThumbModel) model = o; });
    const box = new THREE.Box3();
    if (model) box.setFromObject(model);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
      const half = Math.max(size.x, size.y, size.z) / 2;
      const dist = (half / Math.tan(fov / 2)) / FIT;
      const dir = new THREE.Vector3(1, 0.85, 1.15).normalize();
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = Math.max(0.01, dist / 100);
      camera.far = dist * 20;
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    }
    let frames = 0;
    let id = 0;
    const tick = () => {
      frames += 1;
      gl.render(scene, camera);
      if (frames < 2) { id = requestAnimationFrame(tick); return; }
      shotRef.current(gl.domElement.toDataURL("image/png"));
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [ready, gl, scene, camera]);
  return null;
}

class ThumbErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function initialOf(label: string): string {
  const t = label.trim();
  return t ? Array.from(t)[0]! : "用";
}

/** 左側去背縮圖：拍透明 PNG，整件道具完整入框。 */
export function ItemGlbThumb({ url, label }: { url: string; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [shot, setShot] = useState<string | null>(() => cache.get(cacheKey(url)) ?? null);
  const [ready, setReady] = useState(false);
  const fallback = <span className="hq-item-glb-fallback" aria-hidden="true">{initialOf(label)}</span>;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) setVisible(true); }, { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => { setShot(cache.get(cacheKey(url)) ?? null); setReady(false); }, [url]);

  const onShot = useCallback((dataUrl: string) => {
    cache.set(cacheKey(url), dataUrl);
    setShot(dataUrl);
  }, [url]);
  const markReady = useCallback(() => setReady(true), []);

  return (
    <div ref={root} className="hq-item-glb-thumb" role="img" aria-label={`${label} 預覽`}>
      {shot ? (
        // eslint-disable-next-line @next/next/no-img-element -- 執行時拍出的 data URL 縮圖
        <img src={shot} alt="" draggable={false} />
      ) : visible ? (
        <ThumbErrorBoundary fallback={fallback}>
          <Canvas
            frameloop="demand"
            dpr={1}
            camera={{ position: [1.2, 1, 1.4], fov: 35, near: 0.05, far: 40 }}
            gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" }}
            style={{ background: "transparent" }}
          >
            <ambientLight intensity={0.95} />
            <directionalLight position={[2.2, 3.5, 1.5]} intensity={1.15} />
            <directionalLight position={[-1.5, 1.2, -1]} intensity={0.35} />
            <Suspense fallback={null}>
              <Model url={url} onReady={markReady} />
            </Suspense>
            <Snap ready={ready} onShot={onShot} />
          </Canvas>
        </ThumbErrorBoundary>
      ) : fallback}
    </div>
  );
}
