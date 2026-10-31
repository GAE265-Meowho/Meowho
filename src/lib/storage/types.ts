// 大型檔案（貓影片、居家影像、3D 檔）的儲存介面（決策 006）。
// 業務程式只用這個介面，不直接 import 任何雲端 SDK；換雲端只要新增一個實作並改環境變數。
// 資料庫只存 path（例如 cats/<cat_id>/videos/<uuid>.mp4），網址一律在讀取時才產生。

export interface UploadTarget { url: string; headers: Record<string, string> }

export interface MediaStore {
  /** 有時效的上傳網址與上傳時必須帶的標頭（瀏覽器直接 PUT，不經過我們的伺服器；前端照抄標頭，不寫死任何雲端的規則） */
  uploadUrl(path: string, contentType: string, ttlSec?: number): Promise<UploadTarget>;
  /** 有時效的讀取網址 */
  readUrl(path: string, ttlSec?: number): Promise<string>;
  /** 伺服器端讀取檔案內容（例如送 AI 判讀）；檔案不存在回傳 null */
  download(path: string): Promise<Uint8Array | null>;
  /** 刪除檔案；不存在也算成功 */
  remove(path: string): Promise<void>;
  /** 伺服器端寫入檔案（測試→正式複製用；一般上傳走 uploadUrl） */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** 列出某資料夾（以 / 結尾）底下所有檔案路徑 */
  list(prefix: string): Promise<string[]>;
}

export const UPLOAD_TTL_SEC = 15 * 60;
export const READ_TTL_SEC = 60 * 60;
