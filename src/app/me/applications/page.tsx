"use client";
// 我的領養申請（#128）：領養人看自己申請過、私訊過的貓，和喵戶長對話。
import { DeskPage } from "@/components/desk/DeskPage";

export default function ApplicationsPage() {
  return <DeskPage role="member" title="我的領養申請" path="/me/applications" />;
}
