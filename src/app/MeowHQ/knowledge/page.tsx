"use client";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqModulePending } from "@/components/hq/HqPageHeader";

// 知識管理（M12）：資料表與畫面尚未開發
export default function Page() {
  return (
    <HqModuleGuard module="knowledge">
      <HqModulePending title="知識管理" note="這個模組還在開發中（知識庫文章）。" />
    </HqModuleGuard>
  );
}
