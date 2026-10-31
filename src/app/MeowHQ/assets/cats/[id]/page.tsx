"use client";
// 貓咪頁（T-HQ-11，規格書 04 §2.4）：/MeowHQ/assets/cats/<id>，每隻貓獨立一頁，看這隻貓的動作
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { CatPage } from "@/components/hq/assets/CatPage";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqSkeleton } from "@/components/hq/HqStates";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <HqModuleGuard module="virtual_assets">
      <Suspense fallback={<HqSkeleton rows={4} />}>
        <CatPage id={id} />
      </Suspense>
    </HqModuleGuard>
  );
}
