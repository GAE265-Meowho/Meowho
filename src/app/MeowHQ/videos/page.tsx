"use client";
// 影片（#489，Tina 2026-11-18）：成果影片的腳本與素材工作區。所有登入的管理員都看得到，不需授權模組。
// 分頁以 ?tab= 切換：前導影片的分鏡（預設）與產生影片（#493）；之後的系統操作、架構部署影片加在 VIDEO_TABS。
import { Suspense } from "react";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqSkeleton } from "@/components/hq/HqStates";
import { HqTabs, useListQuery } from "@/components/hq/list/HqList";
import { ClipsBoard } from "@/components/hq/videos/ClipsBoard";
import { TrailerBoard } from "@/components/hq/videos/TrailerBoard";
import { VIDEO_TABS } from "@/lib/hq/videos/trailer";

function VideosPage() {
  const [query, update] = useListQuery();
  const tab = VIDEO_TABS.find(t => t.value === query.tab)?.value ?? "trailer";
  return (
    <>
      <HqPageHeader title="影片" sub="成果影片的分鏡腳本、定角定景照片與分鏡圖。" />
      <HqTabs tabs={[...VIDEO_TABS]} value={tab} onChange={v => update({ tab: v === "trailer" ? undefined : v })} />
      {tab === "trailer-clips" ? <ClipsBoard /> : <TrailerBoard />}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<HqSkeleton rows={3} />}>
      <VideosPage />
    </Suspense>
  );
}
