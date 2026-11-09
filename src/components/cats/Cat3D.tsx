"use client";
// 貓咪頁的 3D 貓：載入中途確認過的 3D 模型（GET /api/cats/[id]/model/look），下方用動作按鈕切換動作。
// 動作沿用 MeowHQ 動作庫，按鈕由 lib/cat-actions.ts 決定；預覽元件和中途確認 3D 模型（PublishPanel）共用 CatPreview。
// 沒有確認過的模型、或載入失敗時整塊不顯示。
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import { catActions } from "@/lib/cat-actions";
import type { CatLook } from "@/lib/cat-publish";
import { FALLBACK_CLIP } from "@/lib/hq/cat-models/clips";
import s from "./catPage.module.css";

const CatPreview = dynamic(() => import("@/components/hq/assets/CatPreview"), { ssr: false, loading: () => <div className={s.modelBox} /> });

export function Cat3D({ catId, catName }: { catId: string; catName: string }) {
  const [look, setLook] = useState<CatLook | null | undefined>(undefined);
  const [clips, setClips] = useState<string[]>([]);
  const [clip, setClip] = useState<string>(FALLBACK_CLIP);
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
  const actions = catActions(clips);
  return (
    <section className={f.card} aria-labelledby="sec-3d">
      <h2 id="sec-3d">3D 的{catName}</h2>
      <div className={s.stage}>
        <div className={s.modelBox}>
          <CatPreview baseUrl={look.base} body={look.body} albedoUrl={look.albedo} clip={clip}
            onInfo={i => setClips(i.clips)} onError={() => setFailed(true)} />
        </div>
        {actions.length > 0 && (
          <div className={s.clips} role="group" aria-label={`讓${catName}做的動作`}>
            {actions.map(a => (
              <button key={a.code} type="button" className={s.clip} aria-pressed={clip === a.code} onClick={() => setClip(a.code)}>{a.label}</button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
