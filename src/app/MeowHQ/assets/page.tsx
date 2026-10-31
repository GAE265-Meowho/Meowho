"use client";
// 虛擬體驗元件管理（T-HQ-11，規格書 04 §1.1）：四個區塊以 ?tab= 切換。
// 貓咪區塊完整實作；室內空間、生活用品、其他先顯示「規劃中」的空白狀態。
import { Suspense } from "react";
import { CatsTab } from "@/components/hq/assets/CatsTab";
import { PlannedTab } from "@/components/hq/assets/PlannedTab";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqSkeleton } from "@/components/hq/HqStates";
import { HqTabs, useListQuery } from "@/components/hq/list/HqList";

const TABS = [
  { value: "cats", label: "貓咪" },
  { value: "rooms", label: "室內空間" },
  { value: "items", label: "生活用品" },
  { value: "others", label: "其他" },
];

function AssetsPage() {
  const [query, update] = useListQuery();
  const tab = TABS.some(t => t.value === query.tab) ? query.tab! : "cats";
  return (
    <>
      <HqPageHeader title="虛擬體驗元件管理" sub="虛擬貓咪新手照顧體驗會用到的 3D 元件。" />
      <HqTabs tabs={TABS} value={tab} onChange={v => update({ tab: v === "cats" ? undefined : v, q: undefined, status: undefined })} />
      {tab === "cats" && <CatsTab query={query} update={update} />}
      {tab === "rooms" && <PlannedTab label="室內空間" examples="房間、場景" />}
      {tab === "items" && <PlannedTab label="生活用品" examples="碗、貓砂盆、玩具、貓抓板" />}
      {tab === "others" && <PlannedTab label="其他" examples="風險點示範動畫等不屬於前三類的元件" />}
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
