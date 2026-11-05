"use client";
// 房間轉換的任務進度（#93）：做法同貓咪頁的紋理貼圖任務，依 worker 回報的步驟，不顯示虛構百分比。
import { ROOM_STAGE_HINTS, ROOM_STAGES, ROOM_STATUS_LABELS, ROOM_TOTAL_MINUTES, roomStage, type RoomView } from "@/lib/hq/rooms/types";
import { elapsedMinutes } from "@/lib/hq/cat-models/types";
import { FlowStepper, type StepIcon } from "./FlowStepper";

const STAGE_ICONS: StepIcon[] = ["queue", "upload", "views", "model", "cutout", "upload"];
const TONE: Record<RoomView["status"], string> = { queued: "mute", running: "warn", ready: "", failed: "danger" };

export function RoomProgress({ room, now }: { room: RoomView; now: number }) {
  const stage = roomStage(room, now);
  const total = ROOM_STAGES.length;
  const steps = ROOM_STAGES.map((title, i) => ({
    title, icon: STAGE_ICONS[i], desc: ROOM_STAGE_HINTS[i],
    state: (i < stage.index ? "done" : i > stage.index ? "todo" : stage.failed || stage.stalled ? "failed" : "active") as "done" | "todo" | "failed" | "active",
    note: i === stage.index && stage.stalled ? "排隊逾時" : undefined,
  }));
  const mins = elapsedMinutes(room.startedAt ?? room.createdAt, now);
  const running = room.status === "queued" || room.status === "running";
  return (
    <section className="hq-box" aria-label="任務進度">
      <h3>{room.name}｜任務進度</h3>
      <p>
        <span className={`hq-tag ${stage.stalled ? "danger" : TONE[room.status]}`}>{stage.stalled ? "排隊逾時" : ROOM_STATUS_LABELS[room.status]}</span>
        {" "}第 {stage.index + 1} 步／共 {total} 步：{ROOM_STAGES[stage.index]}
      </p>
      <FlowStepper compact label="房間轉換進度" steps={steps} />
      {running && !stage.stalled && (
        <p className="hq-hint" role="status">
          {mins !== null && <>已經過 {mins} 分鐘，</>}整體約需 {ROOM_TOTAL_MINUTES} 分鐘。
          {stage.index === 3 ? "這一步最久，畫面沒有變化是正常的；" : ""}離開頁面任務照跑，回來可看到最新進度。
        </p>
      )}
      {stage.stalled && (
        <div className="hq-note" role="alert">排隊超過 2 分鐘還沒開始，轉換用的電腦可能沒有開。請聯絡珮瑜確認 room_worker 有在執行。</div>
      )}
      {room.status === "failed" && (
        <p className="hq-error" role="alert">{ROOM_STAGES[stage.index]}失敗{room.error ? `（${room.error}）` : ""}。可以重拍影片後再上傳一次。</p>
      )}
    </section>
  );
}
