// 建立我家的 3D 房間與居家安全檢測（規格 09 v0.6 §7.2、§8）。
// 2026-11-04 子哲簡化：環境安全檢查一律和建模同時做、不再詢問；處理完（成功或失敗）立即刪除居家原始影片和照片（決策 007）。
//   meow_room_models.env_check 不再讀寫（0017 的欄位先保留）；呼叫 meow_finish_home_room() 時 p_env_check 傳 null。
// 也可以單獨做居家安全檢測：報告的 room_model_id 為 null，同一個喵戶的多份報告依 created_at 排成檢測紀錄。

export const SHOOTING_TIPS = [
  { title: "白天、把燈都打開", body: "光線越亮越清楚。拉開窗簾，避免逆光對著窗戶拍。" },
  { title: "從門口開始，慢慢走一圈", body: "像散步一樣慢慢移動，每間房都繞一圈，牆角、門和窗都要拍到。" },
  { title: "手機拿在胸口高度", body: "鏡頭稍微朝下，拍到地板和家具底下，貓最愛躲的地方也要入鏡。" },
  { title: "一段影片 1～3 分鐘", body: "檔案 50 MB 以內。一次拍一層樓，太大的家可以分幾段。" },
  { title: "先把人和寵物請出畫面", body: "移動的人和動物會讓 3D 房間變模糊。" },
  { title: "收好證件和信件", body: "影片只用來建立房間和環境檢查，完成後就會刪除，但入鏡的個人資料還是先收起來比較安心。" },
] as const;

/** 上傳前的隱私說明（§8，業務規則要求的聲明，用一般內文字級顯示） */
export const UPLOAD_PRIVACY = "我們會用影片或照片建立你家的 3D 房間，同時檢查家裡對貓安不安全。處理完就會刪除原始檔，只留房間和安全報告。";
/** 單獨做居家安全檢測前的說明（§8） */
export const SAFETY_ONLY_PRIVACY = "這次只檢查家裡對貓安不安全，處理完就會刪除原始檔。之後想建立 3D 房間，需要重新拍攝。";

export interface RoomRow { status: string; completed_at?: string | null }
export interface ReportRow { id: string; status: string; room_model_id: string | null; created_at: string; items: unknown[] | null }

/** start＝還沒做（可以開始）、busy＝處理中（停用）、view＝做好了（查看） */
export type ToolState = "start" | "busy" | "view";
export interface HomeTool { label: string; state: ToolState }

const BUSY = new Set(["queued", "running"]);

/** 喵戶卡片兩顆按鈕的狀態（§7.2 狀態表）：建模中兩顆一起停用；有任何一份產生好的報告，第二顆就是「查看報告」 */
export function homeTools(rooms: RoomRow[], reports: Pick<ReportRow, "status">[]): { scene: HomeTool; safety: HomeTool } {
  if (rooms.some(r => BUSY.has(r.status))) {
    return { scene: { label: "3D 房間處理中", state: "busy" }, safety: { label: "安全檢測處理中", state: "busy" } };
  }
  const scene: HomeTool = rooms.some(r => r.status === "ready")
    ? { label: "查看模型", state: "view" } : { label: "生成 3D 環境", state: "start" };
  const safety: HomeTool = reports.some(r => r.status === "ready") ? { label: "查看報告", state: "view" }
    : reports.some(r => BUSY.has(r.status)) ? { label: "安全檢測處理中", state: "busy" }
    : { label: "居家安全檢測", state: "start" };
  return { scene, safety };
}

export type RecordSource = "單獨檢測" | "建立 3D 房間時";
export type SafetyRecord<T extends ReportRow = ReportRow> = T & { source: RecordSource; riskCount: number };

/** 檢測紀錄：只列產生好的報告，最新在前（舊報告不覆蓋，§7.2） */
export function safetyRecords<T extends ReportRow>(reports: T[]): SafetyRecord<T>[] {
  return reports.filter(r => r.status === "ready")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(r => ({ ...r, source: r.room_model_id ? "建立 3D 房間時" : "單獨檢測", riskCount: Array.isArray(r.items) ? r.items.length : 0 }));
}
