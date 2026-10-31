"use client";
// 瀏覽器端的照片縮圖、影片秒數與直傳。照片進 Supabase Storage，影片照伺服器簽發的網址直傳（決策 006）。
import type { UploadTarget } from "@/lib/storage/types";

/** 讀取圖片：優先 createImageBitmap（含 EXIF 轉向），失敗再用 <img>；兩者都失敗代表瀏覽器讀不了這個格式（例如 HEIC） */
async function decode(file: File): Promise<{ img: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { img: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const el = new Image();
      el.src = url;
      await el.decode();
      return { img: el, w: el.naturalWidth, h: el.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
  }
}

/** 縮到最長邊 1024px 的 JPEG（AGENTS.md §7.4），減少上傳與 AI 費用 */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; dataUrl: string; base64: string }> {
  const { img, w, h } = await decode(file);
  const scale = Math.min(1, 1024 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  return { blob, dataUrl, base64: dataUrl.split(",")[1] };
}

/** 從影片檔讀秒數；讀不到回傳 0（伺服器會擋下） */
export function videoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

/** 照伺服器給的網址與標頭直傳；不寫死任何雲端的規則 */
export async function putUpload(target: UploadTarget, file: Blob): Promise<void> {
  const res = await fetch(target.url, { method: "PUT", headers: target.headers, body: file });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
