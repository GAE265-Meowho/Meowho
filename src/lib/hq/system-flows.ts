// MeowHQ 系統操作流程圖（#468，Tina 2026-11-18）：前台兩種角色的操作流程，依 SRS M01–M09 整理。
// 只放文字與圖示代號；畫面在 src/app/MeowHQ/flows，沿用貓咪製作流程的 FlowStepper。
import type { StepIcon } from "@/components/hq/assets/FlowStepper";

export const FLOW_ROLES = [
  { value: "household", label: "貓戶" },
  { value: "adopter", label: "領養人" },
] as const;
export type FlowRole = (typeof FLOW_ROLES)[number]["value"];

export interface FlowPhaseStep { title: string; desc: string; icon: StepIcon }
export interface FlowPhase { title: string; sub: string; start: number; steps: FlowPhaseStep[] }

export const SYSTEM_FLOWS: Record<FlowRole, FlowPhase[]> = {
  household: [
    {
      title: "建立與記錄", sub: "貓戶長日常使用", start: 1,
      steps: [
        { title: "Google 登入", desc: "同意服務條款與隱私權政策", icon: "login" },
        { title: "建立貓戶", desc: "名稱、介紹、封面、縣市＋區（每人最多 2 個）", icon: "home" },
        { title: "新增貓咪", desc: "拍正面／側面／背面照，AI 對話建檔", icon: "cat" },
        { title: "時光小屋", desc: "日記、相簿、影片；AI 每週週報", icon: "diary" },
      ],
    },
    {
      title: "送養", sub: "貓咪設為待領養後", start: 5,
      steps: [
        { title: "設為待領養", desc: "領養費與說明、勾選面談／家訪／領養任務／環境報告", icon: "tag" },
        { title: "審核申請", desc: "比較申請單，私訊聯絡、面談或家訪", icon: "review" },
        { title: "核准並移轉", desc: "雙方確認移轉，試養 14 天後完成", icon: "transfer" },
      ],
    },
  ],
  adopter: [
    {
      title: "找貓", sub: "訪客也能瀏覽", start: 1,
      steps: [
        { title: "Google 登入", desc: "同意服務條款與隱私權政策", icon: "login" },
        { title: "領養人建檔", desc: "約 2 分鐘語音／文字問答：居住、經驗、偏好", icon: "chat" },
        { title: "找到喜歡的貓", desc: "帶我回家、一句話配對，附推薦原因", icon: "search" },
      ],
    },
    {
      title: "申請領養", sub: "依貓戶長的領養流程", start: 4,
      steps: [
        { title: "準備度評估", desc: "沒有飼養經驗：環境報告或領養任務擇一", icon: "check" },
        { title: "送出申請", desc: "自動帶入建檔資料，補填領養原因（同時最多 3 隻）", icon: "send" },
        { title: "面談／家訪", desc: "依貓戶長設定，雙方以私訊聯絡", icon: "review" },
        { title: "移轉與試養", desc: "選擇轉入的貓戶，試養 14 天後完成", icon: "transfer" },
      ],
    },
  ],
};

export const flowRoleOf = (tab: string | undefined | null): FlowRole =>
  FLOW_ROLES.some(r => r.value === tab) ? (tab as FlowRole) : "household";
