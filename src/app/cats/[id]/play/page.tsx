"use client";
// 領養任務（#237、#273）：貓咪頁「進行領養任務」→ /cats/[id]/play。
// 要演哪隻貓由 src/lib/play/source.ts 的 loadPlayCat(id) 決定：讀這隻貓（meow_cats）與 3D 貼圖，讀不到才用 DEMO 麻糬。
// 「前往認養這隻貓」連回貓咪頁（/cats/[id]）。流程與備案見 src/components/play/PlayGame.tsx、docs/modules/readiness.md。
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/Chrome";
import { PlayGame } from "@/components/play/PlayGame";
import { loadPlayCat, type PlayCatSource } from "@/lib/play/source";

export default function PlayPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [cat, setCat] = useState<PlayCatSource | null>(null);
  useEffect(() => {
    let alive = true;
    loadPlayCat(id).then(c => { if (alive) setCat(c); });
    return () => { alive = false; };
  }, [id]);
  return (
    <>
      <SiteHeader />
      <main>
        {cat ? <PlayGame cat={cat} catHref={`/cats/${encodeURIComponent(id)}`} /> : <p role="status">讀取貓咪…</p>}
      </main>
    </>
  );
}
