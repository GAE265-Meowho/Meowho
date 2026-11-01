// 中途之家認證申請（Issue #3）

export type VerificationStatus = "pending" | "approved" | "rejected";
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  pending: "審核中", approved: "已通過", rejected: "未通過",
};

export interface VerificationInput {
  orgType: "personal_foster" | "shelter_org";
  orgName: string;
  proofUrl: string;
  description: string;
}

export function validateVerification(v: VerificationInput): string[] {
  const e: string[] = [];
  if (v.orgType === "shelter_org" && v.orgName.trim().length < 2) e.push("請填寫協會或單位名稱");
  if (v.proofUrl.trim() && !/^https?:\/\/\S+\.\S+/.test(v.proofUrl.trim())) e.push("證明連結需為 http(s) 網址");
  const len = v.description.trim().length;
  if (len < 10) e.push("請用至少 10 個字說明你的中途經驗");
  if (len > 1000) e.push("說明最多 1000 字");
  return e;
}

/** 資料庫錯誤轉成使用者看得懂的話 */
export function friendlyDbError(message: string): string {
  if (/household_limit/.test(message)) return "已經達到喵戶數量上限。";
  if (/shelter_verifications_one_pending|duplicate key/.test(message)) return "這個貓戶已經有一筆審核中的申請。";
  return `發生錯誤：${message}`;
}
