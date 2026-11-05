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

/** 前台我的 3D 房間的私有 bucket（0017）：路徑第一層都是喵戶 id，只有喵戶長讀得到 */
export const HOME_VIDEO_BUCKET = "meow-home-videos";
export const HOME_SCENE_BUCKET = "meow-home-scenes";

/** 飼主上傳的影片路徑：<喵戶 id>/<隨機 uuid>.mp4|mov（伺服器建房間前要確認是這個喵戶的） */
export const isHomeVideoPath = (householdId: string, path: unknown): path is string =>
  typeof path === "string" && path.startsWith(`${householdId}/`)
  && /^[0-9a-f-]{36}\.(mp4|mov)$/.test(path.slice(householdId.length + 1));

/** 檢視器讀成果檔的網址；這支 API 再轉到短時效 signed URL */
export const homeSceneBase = (householdId: string, roomId: string) => `/api/homes/${householdId}/room/${roomId}`;

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

// ---------- 示範報告（AI 環境安全檢查接上前先用） ----------
// ⚠ 單獨檢測、建立 3D 房間時的報告目前都是這份固定內容，由 /api/homes/[id]/safety 與 /api/homes/[id]/room 寫入 meow_env_reports。
//   接上 AI 風險偵測後，改成建 status = 'queued' 的報告、背景產生 items 與風險裁切照（meow-home-risk-crops），再刪掉這段。
export const DEMO_REPORT_ITEMS = [
  { key: "window", label: "窗戶沒有紗窗", level: "high", note: "貓可能從窗戶跳出或摔落。開窗前先裝好紗窗或防墜網。" },
  { key: "plant", label: "陽台的盆栽", level: "high", note: "有些植物對貓有毒，例如百合。不確定的植物先移到貓碰不到的地方。" },
  { key: "cable", label: "電視櫃後面的電線", level: "medium", note: "貓可能會咬電線。把電線收進收納盒或套上保護套。" },
  { key: "small", label: "桌上的髮圈和橡皮筋", level: "medium", note: "小東西容易被貓吞下去，用完收進抽屜。" },
  { key: "trash", label: "沒有蓋子的垃圾桶", level: "low", note: "貓可能翻垃圾桶找食物，換成有蓋子的比較安心。" },
] as const;

export const DEMO_REPORT_SUMMARY = "家裡大部分的地方對貓都很友善，有幾個地方建議在貓來之前先處理，高風險的優先。";

/** 示範報告的一筆：單獨檢測 roomId 為 null，建立 3D 房間時填房間 id */
export function demoReportRow(householdId: string, roomId: string | null, now: Date) {
  const at = now.toISOString();
  return {
    household_id: householdId, room_model_id: roomId, status: "ready", summary: DEMO_REPORT_SUMMARY,
    items: DEMO_REPORT_ITEMS.map(i => ({ ...i })), created_at: at, ready_at: at,
  };
}
