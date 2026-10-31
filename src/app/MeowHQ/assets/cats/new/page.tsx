"use client";
// 新增貓咪（T-HQ-11，規格書 04 §2.3 ①）：/MeowHQ/assets/cats/new
import Link from "next/link";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { ASSETS_CATS_HREF } from "@/components/hq/assets/hrefs";
import { NewCat } from "@/components/hq/assets/NewCat";

export default function Page() {
  return (
    <HqModuleGuard module="virtual_assets">
      <div className="hq-pagehead">
        <Link href={ASSETS_CATS_HREF} className="hq-back">← 虛擬體驗元件管理</Link>
        <h1 className="hq-h1">新增貓咪模型</h1>
      </div>
      <NewCat />
    </HqModuleGuard>
  );
}
