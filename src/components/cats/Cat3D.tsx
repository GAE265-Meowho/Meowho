"use client";
// 貓咪頁的 3D 貓：載入中途確認過的 3D 模型（GET /api/cats/[id]/model/look），放進空間白模。
// 沒有動作按鈕（可以縮放、轉視角）：貓站在原地自己隨機換動作（CatPreview 的 autoplay 模式，規則在 lib/cat-actions.ts）。
// 預覽元件和中途確認 3D 模型（PublishPanel）共用 CatPreview。沒有確認過的模型、或載入失敗時整塊不顯示。
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import type { CatLook } from "@/lib/cat-publish";
import s from "./catPage.module.css";

const CatPreview = dynamic(() => import("@/components/hq/assets/CatPreview"), { ssr: false, loading: () => <div className={s.modelBox} /> });

export function Cat3D({ catId, catName }: { catId: string; catName: string }) {
  const [look, setLook] = useState<CatLook | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/cats/${catId}/model/look`)
      .then(r => (r.ok ? r.json() : { look: null }))
      .then(d => { if (alive) setLook((d.look as CatLook | null) ?? null); })
      .catch(() => { if (alive) setLook(null); });
    return () => { alive = false; };
  }, [catId]);

  if (!look || failed) return null;
  return (
    <section className={f.card} aria-labelledby="sec-3d">
      <h2 id="sec-3d">3D 的{catName}</h2>
      <div className={s.modelBox} role="group" aria-label={`${catName}的 3D 模型，可以拖曳轉視角、滾輪縮放`}>
        <CatPreview baseUrl={look.base} body={look.body} albedoUrl={look.albedo} clip={null} autoplay onError={() => setFailed(true)} />
      </div>
    </section>
  );
}
