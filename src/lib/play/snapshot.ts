// 虛擬飼養：結局回顧用的 3D 畫面截圖（#354）。只在瀏覽器執行。
// 3D 房間（RoomViewer 掃描房間、FloorplanViewer 示範娃娃屋）掛上時登記一個「現在畫一幀、回傳畫布」的函式；
// 截圖時呼叫它，在同一個 JS 工作裡把畫布縮成長邊 640 的 JPEG（WebGL 的畫面在 render 後、交給螢幕前讀得到），
// 所以不用全域打開 preserveDrawingBuffer。哪一刻要截由 ending.ts 的 captureMoment 決定。
import { fitSize } from "./ending";

type Grab = () => HTMLCanvasElement | null;
let grab: Grab | null = null;

/** 3D 房間登記截圖函式；回傳的函式在卸載時呼叫（只清自己登記的那個） */
export function registerSceneGrab(fn: Grab): () => void {
  grab = fn;
  return () => { if (grab === fn) grab = null; };
}

export const SHOT_MAX = 640;
export const SHOT_QUALITY = 0.75;

/** 截目前的 3D 畫面；沒有 3D 房間或讀不到（WebGL 失敗、跨網域貼圖）回 null */
export function captureScene(): string | null {
  try {
    const c = grab?.();
    if (!c || !c.width || !c.height) return null;
    const { w, h } = fitSize(c.width, c.height, SHOT_MAX);
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const g = out.getContext("2d");
    if (!g) return null;
    g.drawImage(c, 0, 0, w, h);
    const src = out.toDataURL("image/jpeg", SHOT_QUALITY);
    return src.startsWith("data:image/jpeg") ? src : null;
  } catch {
    return null;
  }
}
