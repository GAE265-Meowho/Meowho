"use client";
// 生活用品選單縮圖（#197）：把 .glb 拍成透明底 PNG，看起來像去背商品圖；拍完改顯示 img，省 WebGL。
import { Canvas, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

const cache = new Map<string, string>();

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
    const scale = 1.35 / max;
    m.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    m.scale.setScalar(scale);
    return m;
  }, [scene]);
  useEffect(() => { readyRef.current(); }, [prepared]);
  return <primitive object={prepared} />;
}

function Snap({ ready, onShot }: { ready: boolean; onShot: (dataUrl: string) => void }) {
  const { gl, scene, camera } = useThree();
  const shotRef = useRef(onShot);
  shotRef.current = onShot;
  useEffect(() => {
    if (!ready) return;
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

/** 左側去背縮圖：先用透明 Canvas 拍一張，之後快取成 PNG。 */
export function ItemGlbThumb({ url, label }: { url: string; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [shot, setShot] = useState<string | null>(() => cache.get(url) ?? null);
  const [ready, setReady] = useState(false);
  const fallback = <span className="hq-item-glb-fallback" aria-hidden="true">{initialOf(label)}</span>;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) setVisible(true); }, { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => { setShot(cache.get(url) ?? null); setReady(false); }, [url]);

  const onShot = useCallback((dataUrl: string) => {
    cache.set(url, dataUrl);
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
            camera={{ position: [1.15, 0.95, 1.35], fov: 32, near: 0.1, far: 20 }}
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
