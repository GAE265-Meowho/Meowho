"use client";
// 領養管理（#128）：中途在這裡看所有待領養貓收到的申請與私訊，直接和申請人對話、婉拒或恢復。
// 網址沿用原本的「領養申請」頁（#89），舊通知的 #cat-<id> 會篩選到那隻貓。
import { DeskPage } from "@/components/desk/DeskPage";

export default function AdoptionsPage() {
  return <DeskPage role="keeper" title="領養管理" path="/me/adoptions" />;
}
