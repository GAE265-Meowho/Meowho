// 領養任務只留一套規則：/cats/[id]/run 併進 /cats/[id]/play（#354，docs/play-tasks/7-進行中續玩放棄重玩.md）。
// 舊網址（書籤、已寄出的通知）轉到 /play；進行中、續玩、放棄都在那邊處理。
import { redirect } from "next/navigation";

export default async function RunRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/cats/${encodeURIComponent(id)}/play`);
}
