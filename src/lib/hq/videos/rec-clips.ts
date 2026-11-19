// 前導影片第三段的系統錄影（#529，子哲 2026-11-19）：scripts/trailer-rec/rec.mjs 在正式站照分鏡操作真實產品錄下來。
// 每支錄影是「影片」tab 的一格（存 Azure，路徑 videos/trailer/<id>/<時間戳>.mp4），剪輯與 AI 生圖時當參考。
// 錄影帳號：中途＝子哲中途（cookie 為錄影用的複製貓）、領養人＝子哲個人（演小傑）。

export type RecClip = { id: string; shot: number; title: string; who: "中途" | "小傑"; note: string };

export const REC_CLIPS: RecClip[] = [
  { id: "rec-build", shot: 15, title: "建貓：照片、個性、資料到 3D 分身", who: "中途", note: "修改貓咪的拍照、說說牠、補資料、確認，最後到貓咪頁看 3D 與 AI 三視角" },
  { id: "rec-phone", shot: 15, title: "小傑手機打開同一張介紹頁", who: "小傑", note: "手機尺寸（390×844）往下滑貓咪頁" },
  { id: "rec-find", shot: 16, title: "幫我找貓", who: "小傑", note: "輸入「上班族，白天不在家，想要安靜一點的貓」，看推薦與理由" },
  { id: "rec-home", shot: 17, title: "我家的 3D 房間與安全檢測", who: "小傑", note: "切換視角，再到安全檢測報告看「電線與插座高風險」" },
  { id: "rec-play", shot: 18, title: "領養任務：採買到試養報告", who: "小傑", note: "採買、擺用品、第 1 天等牠自己出來、一生時刻、試養報告；鏡 18–21 都從這支剪" },
  { id: "rec-apply", shot: 22, title: "提出領養：填問卷送出", who: "小傑", note: "附上試養報告，填問卷後送出" },
  { id: "rec-chat-mid", shot: 23, title: "對話：阿芳那一側", who: "中途", note: "照腳本對話串一來一回；剪輯時放左半" },
  { id: "rec-chat-adopter", shot: 23, title: "對話：小傑那一側", who: "小傑", note: "同一段對話的領養人畫面；剪輯時放右半" },
  { id: "rec-transfer-mid", shot: 24, title: "移轉：阿芳按下移轉", who: "中途", note: "再輸入貓名、勾選已交接，確認移轉" },
  { id: "rec-transfer-adopter", shot: 24, title: "移轉：小傑接收", who: "小傑", note: "接收後貓咪頁紀錄分成中途時期與新家時期" },
];

export const recClip = (id: string) => REC_CLIPS.find(c => c.id === id);
