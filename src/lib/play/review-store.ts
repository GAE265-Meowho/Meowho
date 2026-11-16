// 虛擬飼養：結局回顧的截圖存在瀏覽器（IndexedDB，key＝runId），續玩後回顧還在（#354）。
// 不存進 meow_task_runs.progress（上限約 50 KB，5 張 JPEG 一定超過）。換裝置、無痕模式、存不了＝沒有那些截圖，回顧改用當下畫面。
// 所有操作失敗都只回 null／不做事，不擋遊戲。
import type { ReviewShot } from "./ending";

const DB = "meowho-play";
const STORE = "review";

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function loadReview(runId: string): Promise<ReviewShot[] | null> {
  const db = await open();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(runId);
      req.onsuccess = () => { db.close(); resolve(Array.isArray(req.result) ? (req.result as ReviewShot[]) : null); };
      req.onerror = () => { db.close(); resolve(null); };
    } catch { db.close(); resolve(null); }
  });
}

export async function saveReview(runId: string, shots: readonly ReviewShot[]): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put([...shots], runId);
      tx.oncomplete = tx.onerror = tx.onabort = () => { db.close(); resolve(); };
    } catch { db.close(); resolve(); }
  });
}
