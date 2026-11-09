"use client";
// 領養任務（#237、#273）：貓咪頁「進行領養任務」→ /cats/[id]/play。
// 要演哪隻貓由 src/lib/play/source.ts 的 loadPlayCat(id) 決定：現在一律是 DEMO 麻糬，之後改讀這隻貓的資料與 3D 模型。
// 「前往認養這隻貓」連回貓咪頁（/cats/[id]）。流程與備案見 src/components/play/PlayGame.tsx、docs/modules/readiness.md。
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/Chrome";
import { PlayGame } from "@/components/play/PlayGame";
import { demoPlayCat, loadPlayCat } from "@/lib/play/source";

export default function PlayPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [cat, setCat] = useState(() => demoPlayCat(id));
  useEffect(() => {
    let alive = true;
    loadPlayCat(id).then(c => { if (alive) setCat(c); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return (
    <>
      <SiteHeader />
      <main>
        <PlayGame cat={cat} catHref={`/cats/${encodeURIComponent(id)}`} />
      </main>
    </>
  );
}
