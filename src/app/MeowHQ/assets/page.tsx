"use client";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqModulePending } from "@/components/hq/HqPageHeader";

// 虛擬體驗元件管理（T-HQ-11）：等 Issue #15 決定 3D 檔儲存位置
export default function Page() {
  return (
    <HqModuleGuard module="virtual_assets">
      <HqModulePending title="虛擬體驗元件管理" note="這個模組還在開發中，3D 檔的儲存位置決定後開始（Issue #15）。" />
    </HqModuleGuard>
  );
}
