"use client";
// 首頁 3D 貓的外觀換成真的貓模型（母體 glb＋這隻貓的貼圖，和貓咪頁、MeowHQ 預覽共用 CatPreview 的 CatModel）。
// 移動、轉身、大小都由 CatJourney 控制 rig.root；這裡只負責換動作（clip）與名牌。
import { Suspense } from "react";
import { CatModel } from "@/components/hq/assets/CatPreview";
import type { CatLook } from "@/lib/cat-publish";
import { type CatRig, useShadowTexture } from "./CatModel";

/** 畫出來的橘子高約 2.2 單位、成貓母體高約 0.5 公尺：放大成同樣大小，CatJourney 的尺寸、名牌位置都不用改 */
const TO_JOURNEY = { adult: 2.2 / 0.5, kitten: 2.2 / 0.25 } as const;

export default function GlbCat({ rig, look, clip, onPet, children }: {
  rig: CatRig; look: CatLook; clip: string; onPet: () => void; children?: React.ReactNode;
}) {
  const shadow = useShadowTexture();
  return (
    <group
      ref={(g) => void (rig.root = g)}
      onClick={(e) => { e.stopPropagation(); onPet(); }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[2.2, 2.8, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      <group scale={TO_JOURNEY[look.body]}>
        <Suspense fallback={null}>
          <CatModel baseUrl={look.base} albedoUrl={look.albedo} body={look.body} clip={clip} />
        </Suspense>
      </group>
      <group ref={(g) => void (rig.tag = g)} position={[0, 2.3, 0]}>
        {children}
      </group>
    </group>
  );
}
