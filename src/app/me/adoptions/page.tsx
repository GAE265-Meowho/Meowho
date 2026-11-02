"use client";
// 領養管理（#128）：申請方和審核方共用。看所有領養申請與私訊、直接對話；中途可以婉拒或恢復，找到家的貓在「送養追蹤」。
// 網址沿用原本的「領養申請」頁（#89），舊通知的 #cat-<id> 會篩選到那隻貓。
import { DeskPage } from "@/components/desk/DeskPage";

export default function AdoptionsPage() {
  return <DeskPage />;
}
