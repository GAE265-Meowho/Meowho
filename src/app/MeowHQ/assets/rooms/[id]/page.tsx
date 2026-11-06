"use client";
// 影片轉換：單間房的預覽頁 /MeowHQ/assets/rooms/<id>（#93）
import { useParams } from "next/navigation";
import { RoomVideoRoom } from "@/components/hq/assets/RoomVideoRoom";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqNotFound } from "@/components/hq/HqLoginPage";
import { ROOM_ID_RE } from "@/lib/hq/rooms/types";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <HqModuleGuard module="virtual_assets">
      {ROOM_ID_RE.test(id) ? <RoomVideoRoom id={id} /> : <HqNotFound />}
    </HqModuleGuard>
  );
}
