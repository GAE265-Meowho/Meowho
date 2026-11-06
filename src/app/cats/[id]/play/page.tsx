"use client";
// 虛擬飼養 DEMO（#237）：/cats/[id]/play。DEMO 固定麻糬（虎斑），id 不認得也用麻糬；之後從貓咪頁進來、改讀這隻貓的資料。
// 「前往認養這隻貓」先連回貓咪頁（/cats/[id]）。流程與備案見 src/components/play/PlayGame.tsx、docs/modules/readiness.md。
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/Chrome";
import { PlayGame } from "@/components/play/PlayGame";

export default function PlayPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <SiteHeader />
      <main>
        <PlayGame catHref={`/cats/${encodeURIComponent(id ?? "")}`} />
      </main>
    </>
  );
}
