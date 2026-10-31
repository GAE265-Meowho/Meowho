"use client";
// 貼圖工作頁（T-HQ-11，規格書 04 §2.3）：/MeowHQ/assets/cats/<id>/studio
import { useParams } from "next/navigation";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { StudioPageBody } from "@/components/hq/assets/StudioPage";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <HqModuleGuard module="virtual_assets">
      <StudioPageBody id={id} />
    </HqModuleGuard>
  );
}
