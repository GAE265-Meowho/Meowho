"use client";
// 影片轉換：單間房的預覽頁（#93）。完成的看 3D 檢視、下載成果；處理中的看任務進度（每 5 秒更新）。
import dynamic from "next/dynamic";
import Link from "next/link";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqLoadError, HqSaveButton, HqSkeleton } from "@/components/hq/HqStates";
import { HqNotFound } from "@/components/hq/HqLoginPage";
import { secondsBetween } from "@/lib/hq/rooms/types";
import { assetSectionHref } from "./hrefs";
import { RoomProgress } from "./RoomProgress";
import { downloadRoom, duration, useRooms } from "./RoomVideoTab";

const RoomViewer = dynamic(() => import("./RoomViewer"), { ssr: false, loading: () => <HqSkeleton rows={3} /> });

export function RoomVideoRoom({ id }: { id: string }) {
  const { value, now, reload } = useRooms();
  if (value.state === "loading") return <HqSkeleton rows={4} />;
  if (value.state === "error") return <HqLoadError onRetry={reload} />;
  const room = value.data.find(r => r.id === id);
  if (!room) return <HqNotFound />;
  const spent = room.status === "ready" ? secondsBetween(room.startedAt, room.finishedAt) : null;

  return (
    <>
      <HqPageHeader title={`影片轉換｜${room.name}`} sub={room.note || "拖曳轉頭、WASD 走動；下載會把成果檔打包成 zip。"} />
      <Link href={assetSectionHref("rooms-video")} className="hq-back">← 影片轉換</Link>
      {room.status !== "ready" ? <RoomProgress room={room} now={now} />
        : room.resultBase ? (
          <section className="hq-box" aria-label="3D 檢視">
            <div className="hq-row">
              <p className="hq-hint">{room.createdBy ?? "—"}{spent !== null && <>｜轉換耗時 {duration(spent)}</>}</p>
              <HqSaveButton onSave={() => downloadRoom(room)}>下載</HqSaveButton>
            </div>
            <RoomViewer key={room.resultBase} base={room.resultBase} />
          </section>
        )
        : <div className="hq-state"><p>這間房間沒有 3D 成果。</p></div>}
    </>
  );
}
