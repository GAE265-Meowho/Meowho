"use client";
// 平面圖轉換：一戶的工作頁 /MeowHQ/assets/floorplans/<id>（#138）
import { useParams } from "next/navigation";
import { FloorplanHouse } from "@/components/hq/assets/FloorplanHouse";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqNotFound } from "@/components/hq/HqLoginPage";
import { isHouseId } from "@/lib/hq/floorplans/types";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <HqModuleGuard module="virtual_assets">
      {isHouseId(id) ? <FloorplanHouse id={id} /> : <HqNotFound />}
    </HqModuleGuard>
  );
}
