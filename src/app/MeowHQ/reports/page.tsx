"use client";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqModulePending } from "@/components/hq/HqPageHeader";

// 檢舉與內容審核（M15、M16）：資料表與畫面尚未開發
export default function Page() {
  return (
    <HqModuleGuard module="report_moderation">
      <HqModulePending title="檢舉與內容審核" note="這個模組還在開發中（檢舉與 AI 內容審核）。" />
    </HqModuleGuard>
  );
}
