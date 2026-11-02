"use client";
// 影片轉換（#93）：上傳影片建立轉換工作，下方顯示展示房間。
import dynamic from "next/dynamic";
import { useState } from "react";
import { HqSkeleton } from "@/components/hq/HqStates";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { RoomUpload } from "./RoomUpload";

const RoomViewer = dynamic(() => import("./RoomViewer"), { ssr: false, loading: () => <HqSkeleton rows={3} /> });

export function RoomVideoTab() {
  const [picked, setPicked] = useState<string | null>(null);
  const base = picked ?? process.env.NEXT_PUBLIC_ROOM_DEMO_BASE;
  return (
    <div className="hq-roomvideo">
      {(isSupabaseConfigured || process.env.NEXT_PUBLIC_ROOM_LOCAL === "1") && <RoomUpload onView={setPicked} />}
      {base ? <RoomViewer key={base} base={base} /> : <div className="hq-state"><p>轉換完成後，在上面選一間房間查看。</p></div>}
    </div>
  );
}
