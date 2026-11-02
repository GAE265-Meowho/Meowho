"use client";
// 新增貓咪模型（T-HQ-11，規格書 04 §2.3 ①；#110 兩步驟）：/MeowHQ/assets/cats/new（建立後 ?id=<貓咪>）
import Link from "next/link";
import { Suspense } from "react";
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
      <Suspense fallback={null}><NewCat /></Suspense>
    </HqModuleGuard>
  );
}
