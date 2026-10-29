"use client";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqModulePending } from "@/components/hq/HqPageHeader";

// 商品（M12、M13）：資料表與畫面尚未開發
export default function Page() {
  return (
    <HqModuleGuard module="products">
      <HqModulePending title="商品" note="這個模組還在開發中（寵物飼料、用品、參考價、導購成效）。" />
    </HqModuleGuard>
  );
}
