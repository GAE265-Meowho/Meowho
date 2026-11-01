"use client";
// 骨架測試台：/MeowHQ/assets/bases/<adult|kitten>，測試體型骨架的動作與眼睛參數
import { useParams } from "next/navigation";
import { BaseLab } from "@/components/hq/assets/BaseLab";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqNotFound } from "@/components/hq/HqLoginPage";

export default function Page() {
  const { body } = useParams<{ body: string }>();
  return (
    <HqModuleGuard module="virtual_assets">
      {body === "adult" || body === "kitten" ? <BaseLab body={body} /> : <HqNotFound />}
    </HqModuleGuard>
  );
}
