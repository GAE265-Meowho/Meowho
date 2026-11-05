"use client";
// 虛擬體驗元件管理（T-HQ-11，規格書 04 §1.1）：區塊以 ?tab= 切換，選單在左側子選單（#113，原本頁面上的分頁移除）。
// 貓咪、室內空間、食物目錄與虛擬體驗；未實作區塊顯示規劃中。
import { Suspense } from "react";
import { CatsTab } from "@/components/hq/assets/CatsTab";
import { FoodTab } from "@/components/hq/assets/FoodTab";
import Link from "next/link";
import { ASSET_SECTIONS, assetSectionHref, isAssetSection } from "@/components/hq/assets/hrefs";
import { RoomsTab } from "@/components/hq/assets/RoomsTab";
import { RoomVideoTab } from "@/components/hq/assets/RoomVideoTab";
import { FloorplanTab } from "@/components/hq/assets/FloorplanTab";
import { ExperienceTab } from "@/components/hq/assets/ExperienceTab";
import { ItemsTab } from "@/components/hq/assets/ItemsTab";
import { PlannedTab } from "@/components/hq/assets/PlannedTab";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqSkeleton } from "@/components/hq/HqStates";
import { useListQuery } from "@/components/hq/list/HqList";

const PLANNED: Record<string, string> = {
  "rooms-polaroid": "把寶麗來（拍立得）照片轉成室內場景",
  others: "風險點示範動畫等不屬於前幾類的元件",
};

function AssetsPage() {
  const [query, update] = useListQuery();
  const tab = isAssetSection(query.tab) ? query.tab : "cats";
  const section = ASSET_SECTIONS.find(s => s.value === tab)!;
  const parent = "parent" in section ? ASSET_SECTIONS.find(s => s.value === section.parent)! : null;
  return (
    <>
      <HqPageHeader title={`虛擬體驗元件管理｜${section.label}`}
        sub={tab === "food" ? "分類瀏覽食物照片、規格與 TWD 參考價；詳細資訊連至皇家官方。"
          : tab === "experience" ? "選一隻虛擬貓和一戶喵戶，把貓放進 3D 室內空間互動；右側可篩選生活用品並拖拉進房間。"
          : tab === "items" ? "上傳生活用品 .glb、管理類別與篩選；虛擬體驗可把用品放到房間。"
          : "虛擬貓咪新手照顧體驗會用到的 3D 元件。"} />
      {parent && <Link href={assetSectionHref(parent.value)} className="hq-back">← {parent.label}</Link>}
      {tab === "cats" ? <CatsTab query={query} update={update} />
        : tab === "food" ? <FoodTab />
        : tab === "items" ? <ItemsTab />
        : tab === "rooms" ? <RoomsTab />
        : tab === "rooms-video" ? <RoomVideoTab />
        : tab === "rooms-floorplan" ? <FloorplanTab />
        : tab === "experience" ? <ExperienceTab />
        : <PlannedTab label={section.label} examples={PLANNED[tab]} />}
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
