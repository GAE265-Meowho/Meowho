// 把示範貓（第一隻虎斑貓）與母體 glb 匯入 Supabase（0005 的表／bucket）。
// 需要 .env.local：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY。
//   npx tsx --conditions=react-server scripts/import-hq-cat-model.mts          預覽
//   npx tsx --conditions=react-server scripts/import-hq-cat-model.mts --apply  真的寫入
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// 一律以 .env.local 為準（略過 shell 殘留的空值／舊值）
for (const raw of readFileSync(join(root, ".env.local"), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i <= 0) continue;
  const key = line.slice(0, i).trim();
  let val = line.slice(i + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (/^[A-Z0-9_]+$/.test(key)) process.env[key] = val;
}

const apply = process.argv.includes("--apply");
const CAT_ID = "cat_20261030_140731";
const PHOTO_BUCKET = "meow-cat-model-photos";
const MODEL_BUCKET = "meow-cat-models";
const photoPath = `${CAT_ID}/photo.jpg`;
const albedoPath = `${CAT_ID}/paint_albedo.png`;
const basePath = "base/v1/base_clips.glb";

const bundled = join(root, "public", "hq-cat-models");
const files = {
  photo: join(bundled, "cats", CAT_ID, "photo.jpg"),
  albedo: join(bundled, "cats", CAT_ID, "paint_albedo.png"),
  base: join(bundled, "base", "base_clips.glb"),
};

for (const [k, p] of Object.entries(files)) {
  if (!existsSync(p)) throw new Error(`找不到 ${k}：${p}`);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error(".env.local 缺 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

console.log(`匯入 ${CAT_ID}（第一隻虎斑貓）→ ${url}`);
console.log(`  photo  → ${PHOTO_BUCKET}/${photoPath}`);
console.log(`  albedo → ${MODEL_BUCKET}/${albedoPath}`);
console.log(`  base   → ${MODEL_BUCKET}/${basePath}`);

if (!apply) {
  console.log("這次只是預覽。確認無誤後加上 --apply 再執行。");
  process.exit(0);
}

async function upsertFile(bucket: string, path: string, file: string, contentType: string) {
  const body = readFileSync(file);
  const { error } = await sb.storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
  console.log(`  已上傳 ${bucket}/${path} (${body.length} bytes)`);
}

await upsertFile(PHOTO_BUCKET, photoPath, files.photo, "image/jpeg");
await upsertFile(MODEL_BUCKET, albedoPath, files.albedo, "image/png");
await upsertFile(MODEL_BUCKET, basePath, files.base, "model/gltf-binary");

const row = {
  id: CAT_ID,
  name: "第一隻虎斑貓",
  owner_type: "template",
  owner_id: null,
  status: "ready",
  profile: { age_months: 5, weight_kg: 4, notes: "" },
  photo_path: photoPath,
  photo_view: "front",
  fill_pattern: "tabby",
  albedo_path: albedoPath,
  prev_albedo_path: null,
  glb_path: null,
  base_version: "v1",
  clip_library_version: 1,
  meta: {},
  updated_at: new Date().toISOString(),
};

const { error: upErr } = await sb.from("meow_cat_models").upsert(row, { onConflict: "id" });
if (upErr) throw new Error(`meow_cat_models upsert: ${upErr.message}`);
console.log("  已寫入 meow_cat_models（status=ready，可上架）");

const { data } = await sb.from("meow_cat_models").select("id,name,status,albedo_path").eq("id", CAT_ID).single();
console.log("完成：", data);
