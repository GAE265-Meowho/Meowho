"use client";
// 虛擬體驗元件管理（T-HQ-11，規格書 04 §1.1）：區塊以 ?tab= 切換，選單在左側子選單（#113，原本頁面上的分頁移除）。
// 貓咪製作完整實作；其他區塊先顯示「規劃中」的空白狀態。
import { Suspense } from "react";
import { CatsTab } from "@/components/hq/assets/CatsTab";
import { ASSET_SECTIONS, isAssetSection } from "@/components/hq/assets/hrefs";
import { PlannedTab } from "@/components/hq/assets/PlannedTab";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqSkeleton } from "@/components/hq/HqStates";
import { useListQuery } from "@/components/hq/list/HqList";

const PLANNED: Record<string, string> = {
  rooms: "房間、場景",
  "rooms-polaroid": "把寶麗來（拍立得）照片轉成室內場景",
  "rooms-floorplan": "把平面圖轉成 3D 室內空間",
  food: "飼料、零食等 3D 模型",
  items: "碗、貓砂盆、玩具、貓抓板",
  others: "風險點示範動畫等不屬於前幾類的元件",
};

function AssetsPage() {
  const [query, update] = useListQuery();
  const tab = isAssetSection(query.tab) ? query.tab : "cats";
  const label = ASSET_SECTIONS.find(s => s.value === tab)!.label;
  return (
    <>
      <HqPageHeader title={`虛擬體驗元件管理｜${label}`} sub="虛擬貓咪新手照顧體驗會用到的 3D 元件。" />
      {tab === "cats" ? <CatsTab query={query} update={update} /> : <PlannedTab label={label} examples={PLANNED[tab]} />}
    </>
  );
}

export default function Page() {
  return (
    <HqModuleGuard module="virtual_assets">
      <Suspense fallback={<HqSkeleton rows={3} />}>
        <AssetsPage />
      </Suspense>
    </HqModuleGuard>
  );
}
