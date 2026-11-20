// 把做好的分鏡圖上傳成某一格的新一版（舊版保留）：npx tsx scripts/trailer-board/upload-frame.mts <格代號> <圖檔>
// 轉 WebP、最長邊 1920、1 MB 內（同分鏡 tab 的上傳規則）。需要 .env.local 的 NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY。
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { allSlotIds, frameStoragePath, TRAILER_BUCKET, TRAILER_DIR, FRAME_MAX_BYTES, FRAME_MAX_EDGE } = await import("../../src/lib/hq/videos/trailer.ts");
const [slot, file] = process.argv.slice(2);
if (!allSlotIds().includes(slot)) throw new Error(`沒有這一格：${slot}`);
const enc = (q: number) => sharp(file).resize(FRAME_MAX_EDGE, FRAME_MAX_EDGE, { fit: "inside", withoutEnlargement: true }).webp({ quality: q }).toBuffer();
let q = 88, out = await enc(q);
while (out.length > FRAME_MAX_BYTES && q > 40) { q -= 8; out = await enc(q); }
const path = frameStoragePath(slot, new Date());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { error } = await sb.storage.from(TRAILER_BUCKET).upload(path, out, { contentType: "image/webp", upsert: false });
if (error) throw new Error(error.message);
const { data } = await sb.storage.from(TRAILER_BUCKET).list(TRAILER_DIR, { limit: 1000 });
console.log(`上傳 ${path}（${Math.round(out.length / 1024)} KB）；${slot} 共 ${data!.filter(f => f.name.startsWith(`${slot}__`)).length} 版`);
