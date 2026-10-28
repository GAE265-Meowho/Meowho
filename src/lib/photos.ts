// 擬真照片：來自團隊的 Google Stitch 設計稿（AI 生成）。
// 預設直接引用 Stitch 的圖片網址；執行 `npm run photos:download` 後，
// 設定 NEXT_PUBLIC_LOCAL_PHOTOS=1 即改用 public/photos 內的本機檔案（建議正式展示前執行，避免外部網址失效）。
import urls from "./photo-urls.json";

export type PhotoKey = keyof typeof urls;

export function photo(key: PhotoKey): string {
  return process.env.NEXT_PUBLIC_LOCAL_PHOTOS === "1" ? `/photos/${key}.jpg` : urls[key];
}
