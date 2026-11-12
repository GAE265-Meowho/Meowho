"use client";
// 3D 貓咪體型預覽：/MeowHQ/assets/bases?body=large|adult|kitten（#302 大貓｜成貓｜幼貓三分頁；#110 從貓咪 tab 移到這裡）
import { Suspense } from "react";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqSkeleton } from "@/components/hq/HqStates";
import { BasesPage } from "@/components/hq/assets/BasesPage";

export default function Page() {
  return (
    <HqModuleGuard module="virtual_assets">
      <Suspense fallback={<HqSkeleton rows={4} />}>
        <BasesPage />
      </Suspense>
    </HqModuleGuard>
  );
}
