// 把 rec.mjs 錄好的系統錄影與截圖放上 MeowHQ「前導影片」（#529）：
//   npm run trailer:upload -- <錄影輸出資料夾>            先列出會上傳哪些（不動任何檔案）
//   npm run trailer:upload -- <錄影輸出資料夾> --apply    真的上傳
// 影片 → Azure videos/trailer/rec-*/<時間戳>.mp4（「影片」tab 的系統錄影格）
// 截圖 → Supabase meow-site-assets videos/trailer/<格>__<時間戳>.webp（「分鏡」tab 的系統錄影格，最長邊 1920、1 MB 內）
// 需要 .env.local 的 AZURE_STORAGE_*、NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY。
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
const { createAzureStore } = await import("../../src/lib/storage/azure.ts");
const { storageConfig } = await import("../../src/lib/storage/config.ts");
const { trailerVideoPath } = await import("../../src/lib/hq/videos/trailer-video.ts");
const { frameStoragePath, TRAILER_BUCKET, FRAME_MAX_BYTES, FRAME_MAX_EDGE } = await import("../../src/lib/hq/videos/trailer.ts");

for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const [dir, ...rest] = process.argv.slice(2);
const APPLY = rest.includes("--apply");
if (!dir) { console.error("用法：npm run trailer:upload -- <錄影輸出資料夾> [--apply]"); process.exit(1); }

// 錄影檔名（rec.mjs 的段名）→ 影片 tab 的格
const VIDEOS: Record<string, string> = {
  "s15-build": "rec-build", "s15-phone": "rec-phone", "s16-find": "rec-find", "s17-home": "rec-home",
  "s18-21-play": "rec-play", "s22-apply": "rec-apply", "s23-chat-mid": "rec-chat-mid", "s23-chat-adopter": "rec-chat-adopter",
  "s24-transfer-mid": "rec-transfer-mid", "s24-transfer-adopter": "rec-transfer-adopter",
};
// 截圖 → 分鏡 tab 的系統錄影格（鏡 18 s21、鏡 20 s23、鏡 21 s24、鏡 22 s25、鏡 24 s27）；有多張候選時取第一張存在的
const FRAMES: Record<string, string[]> = {
  s21: ["s18-place", "s18-shop"], s23: ["s20-life-y5", "s20-life-half", "s20-life-y10"], s24: ["s21-report"],
  s25: ["s22-apply-sent", "s22-apply-review"], s27: ["s24-transfer-done", "s24-transfer-sent"],
};

const store = createAzureStore(storageConfig(process.env)!);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const now = new Date();

for (const [file, slot] of Object.entries(VIDEOS)) {
  const src = `${dir}/${file}.mp4`;
  if (!existsSync(src)) { console.log(`略過 ${slot}：沒有 ${file}.mp4`); continue; }
  const path = trailerVideoPath(slot, "video/mp4", now);
  const bytes = readFileSync(src);
  console.log(`${APPLY ? "上傳" : "會上傳"} ${file}.mp4（${(bytes.length / 1e6).toFixed(1)} MB）→ ${path}`);
  if (APPLY) await store.put(path, bytes, "video/mp4");
}
for (const [slot, names] of Object.entries(FRAMES)) {
  const name = names.find(n => existsSync(`${dir}/${n}.png`));
  if (!name) { console.log(`略過分鏡 ${slot}：沒有截圖`); continue; }
  let q = 85, out = await sharp(`${dir}/${name}.png`).resize(FRAME_MAX_EDGE, FRAME_MAX_EDGE, { fit: "inside", withoutEnlargement: true }).webp({ quality: q }).toBuffer();
  while (out.length > FRAME_MAX_BYTES && q > 40) { q -= 10; out = await sharp(`${dir}/${name}.png`).resize(FRAME_MAX_EDGE, FRAME_MAX_EDGE, { fit: "inside", withoutEnlargement: true }).webp({ quality: q }).toBuffer(); }
  const path = frameStoragePath(slot, now);
  console.log(`${APPLY ? "上傳" : "會上傳"} ${name}.png（WebP ${(out.length / 1024).toFixed(0)} KB）→ ${TRAILER_BUCKET}/${path}`);
  if (APPLY) { const { error } = await sb.storage.from(TRAILER_BUCKET).upload(path, out, { contentType: "image/webp", upsert: false }); if (error) console.log("  失敗", error.message); }
}
console.log(APPLY ? "完成" : "預演結束，加 --apply 才上傳");
