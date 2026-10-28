// 下載 Stitch 設計稿照片到 public/photos：node scripts/download-photos.mjs
import { mkdir, writeFile, readFile } from "node:fs/promises";
const urls = JSON.parse(await readFile(new URL("../src/lib/photo-urls.json", import.meta.url), "utf8"));
const dir = new URL("../public/photos/", import.meta.url);
await mkdir(dir, { recursive: true });
for (const [key, url] of Object.entries(urls)) {
  const res = await fetch(url);
  if (!res.ok) { console.error(`✗ ${key}: HTTP ${res.status}`); continue; }
  await writeFile(new URL(`${key}.jpg`, dir), Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${key}`);
}
console.log("完成。在 .env.local 加上 NEXT_PUBLIC_LOCAL_PHOTOS=1 即改用本機照片。");
