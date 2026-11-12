// 前台「我的 3D 房間」的房間檔存在瀏覽器（Cache Storage），第二次打開不用再下載 12 MB（#354）。
// 讀檔 API 每次都換新的 signed URL，瀏覽器的 HTTP 快取認不出是同一個檔，所以改用固定的 API 網址當 key 自己存。
// 隱私（決策 007：房間成果不能放公開空間；這裡是使用者自己的瀏覽器）：
//   快取名稱帶登入者 id，換帳號讀不到；登出時 clearRoomCache() 全部刪掉；只留最近 MAX_ROOMS 間。
//   存不了（無痕、空間不夠、iPhone 清掉）就照常下載，不影響看房間。

const PREFIX = "meowho-rooms-";
const RECENT_KEY = "meowho.roomRecent";
export const MAX_ROOMS = 3;

/** 只有前台私有房間（經 /api/homes 讀檔）要自己存；後台公開房間網址固定，瀏覽器本來就會快取 */
export const isPrivateRoomBase = (base: string) => base.startsWith("/api/homes/");

const store = () => (typeof caches === "undefined" ? null : caches);

/** 讀房間裡的一個檔：有存過就直接拿，沒有就下載（回報進度）並存起來 */
export async function roomFile(url: string, userId: string | null, onProgress?: (loaded: number, total: number) => void): Promise<Blob> {
  const cache = userId ? await store()?.open(PREFIX + userId).catch(() => null) : null;
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) {
    const blob = await hit.blob();
    onProgress?.(blob.size, blob.size);
    return blob;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await readAll(res, onProgress);
  await cache?.put(url, new Response(blob, { headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream" } }))
    .catch(() => {});  // 空間不夠就不存，下次再下載
  return blob;
}

async function readAll(res: Response, onProgress?: (loaded: number, total: number) => void): Promise<Blob> {
  const total = Number(res.headers.get("Content-Length")) || 0;
  if (!res.body || !onProgress) return res.blob();
  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  return new Blob(parts, { type: res.headers.get("Content-Type") ?? "" });
}

/** 記下剛看過的房間；超過 MAX_ROOMS 間就把最久沒看的那間的檔案刪掉 */
export async function keepRecentRoom(userId: string, roomBase: string) {
  let recent: string[] = [];
  try { recent = JSON.parse(localStorage.getItem(`${RECENT_KEY}.${userId}`) ?? "[]"); } catch { /* 讀不到就當沒看過 */ }
  recent = [roomBase, ...recent.filter(r => r !== roomBase)];
  const drop = recent.slice(MAX_ROOMS);
  try { localStorage.setItem(`${RECENT_KEY}.${userId}`, JSON.stringify(recent.slice(0, MAX_ROOMS))); } catch { /* 存不了就算了 */ }
  if (!drop.length) return;
  const cache = await store()?.open(PREFIX + userId).catch(() => null);
  if (!cache) return;
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (drop.some(base => path.startsWith(base))) await cache.delete(req);
  }
}

/** 登出時呼叫：刪掉這個瀏覽器裡所有帳號存的房間檔 */
export async function clearRoomCache() {
  const s = store();
  if (s) for (const name of await s.keys().catch(() => [] as string[])) if (name.startsWith(PREFIX)) await s.delete(name).catch(() => false);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(RECENT_KEY)) localStorage.removeItem(k);
  } catch { /* 沒有 localStorage 就不用清 */ }
}
