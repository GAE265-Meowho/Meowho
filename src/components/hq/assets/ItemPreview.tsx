"use client";
// 生活用品卡片的小型 3D 預覽（#197）：載入公開 bucket 的 .glb，自動框進畫面。
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const prepared = useMemo(() => {
    const m = scene.clone(true);
    m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z, 1e-4);
    const scale = 1.2 / max;
    m.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    m.scale.setScalar(scale);
    return m;
  }, [scene]);
  return <primitive object={prepared} />;
}

export function ItemPreview({ url, label }: { url: string; label: string }) {
  return (
    <div className="hq-item-preview" role="img" aria-label={`${label} 3D 預覽`}>
      <Canvas camera={{ position: [1.4, 1.1, 1.6], fov: 35 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#EEF4EF"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 4, 2]} intensity={1.2} />
        <Suspense fallback={null}>
          <Model url={url} />
        </Suspense>
        <OrbitControls enablePan={false} minDistance={0.8} maxDistance={4} target={[0, 0.35, 0]} />
      </Canvas>
    </div>
  );
}
