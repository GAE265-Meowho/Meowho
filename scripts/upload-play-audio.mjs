// 把虛擬飼養的音檔上傳到 Supabase Storage（第 6 份，#393）。
// 用法：npm run audio:upload -- <資料夾>           先列出會上傳哪些（不會真的傳）
//       npm run audio:upload -- <資料夾> --apply   真的上傳（同名會覆蓋）
// 資料夾裡的檔名必須是 ID（bgm_daily.mp3、sfx_meow.mp3），每個音檔旁邊要有 <ID>.license.txt，缺了就不傳。
// 認得的 ID 照 src/lib/play/audio.ts 的 SOUNDS；不認得的檔名會列出來、不上傳。
// 需要 .env.local 的 NEXT_PUBLIC_SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY；bucket 不存在會自動建立（設定同 0035）。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const BUCKET = "meow-play-audio";
const MIME = { mp3: "audio/mpeg", ogg: "audio/ogg", txt: "text/plain; charset=utf-8" };

function env(name) {
  if (process.env[name]) return process.env[name];
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8").split("\n").find(l => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, "") : "";
}

/** 從 audio.ts 讀出所有 ID（不用另外維護一份清單） */
function knownIds() {
  const src = readFileSync(resolve(process.cwd(), "src/lib/play/audio.ts"), "utf8");
  return new Set([...src.matchAll(/\b((?:bgm|sfx)_[a-z_]+):\s*\{/g)].map(m => m[1]));
}

const [dir, ...flags] = process.argv.slice(2);
if (!dir) { console.error("用法：npm run audio:upload -- <資料夾> [--apply]"); process.exit(1); }
const apply = flags.includes("--apply");
const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) { console.error("缺 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（.env.local）"); process.exit(1); }

const ids = knownIds();
const files = readdirSync(dir).filter(f => /\.(mp3|ogg)$/.test(f)).sort();
const plan = [];
for (const f of files) {
  const id = f.replace(/\.(mp3|ogg)$/, "");
  const license = `${id}.license.txt`;
  if (!ids.has(id)) { console.log(`略過 ${f}：不是 audio.ts 認得的 ID`); continue; }
  if (!existsSync(join(dir, license))) { console.log(`略過 ${f}：缺 ${license}`); continue; }
  const folder = id.startsWith("bgm_") ? "bgm" : "sfx";
  plan.push({ local: join(dir, f), path: `${folder}/${f}` }, { local: join(dir, license), path: `${folder}/${license}` });
}
for (const p of plan) console.log(`${apply ? "上傳" : "會上傳"} ${p.path}`);
if (!plan.length) { console.log("沒有可以上傳的檔案"); process.exit(0); }
if (!apply) { console.log("\n只是預覽，加 --apply 才會真的上傳"); process.exit(0); }

const auth = { Authorization: `Bearer ${key}`, apikey: key };
const bucket = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, { headers: auth });
if (bucket.status === 404 || bucket.status === 400) {
  const made = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 5242880, allowed_mime_types: ["audio/mpeg", "audio/ogg", "text/plain"] }),
  });
  if (!made.ok) { console.error(`建立 bucket 失敗：${made.status} ${await made.text()}`); process.exit(1); }
  console.log(`已建立 bucket ${BUCKET}`);
}

let failed = 0;
for (const p of plan) {
  const ext = p.path.split(".").pop();
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${p.path}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": MIME[ext], "x-upsert": "true", "Cache-Control": "max-age=604800" },
    body: readFileSync(p.local),
  });
  if (res.ok) console.log(`完成 ${p.path}`);
  else { failed++; console.error(`失敗 ${p.path}：${res.status} ${await res.text()}`); }
}
console.log(failed ? `\n${failed} 個失敗` : `\n全部完成：${url}/storage/v1/object/public/${BUCKET}/`);
process.exit(failed ? 1 : 0);
