"use client";
// 體型骨架預覽：/MeowHQ/assets/bases，成貓、幼貓兩隻骨架（#110 從貓咪 tab 移到這裡，用「體型骨架預覽」按鈕進入）
import Link from "next/link";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { BaseSamples } from "@/components/hq/assets/BaseSamples";
import { ASSETS_CATS_HREF } from "@/components/hq/assets/hrefs";

export default function Page() {
  return (
    <HqModuleGuard module="virtual_assets">
      <div className="hq-pagehead">
        <Link href={ASSETS_CATS_HREF} className="hq-back">← 虛擬體驗元件管理</Link>
        <h1 className="hq-h1">體型骨架預覽</h1>
      </div>
      <BaseSamples />
    </HqModuleGuard>
  );
}
