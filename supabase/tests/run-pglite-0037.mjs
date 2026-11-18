// 0037（前導影片分鏡圖，#489）：0001→0003 後跑 0037 兩次，在記憶體內的 PGlite 驗證，不會連到任何 Supabase 專案。
// 用法：node supabase/tests/run-pglite-0037.mjs（需要 @electric-sql/pglite，同 run-pglite.mjs）
// 涵蓋：管理員可在 videos/trailer/ 新增與列出；不能放到其他資料夾、不能刪除；一般會員不行；系統管理員照舊（停權管理員由 meow_is_admin 排除，0002 已測）
import { readFileSync } from "node:fs";

const { PGlite } = await import("@electric-sql/pglite");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const results = [];
const m = new PGlite();
const id = (n) => `00000000-0000-0000-0000-0000000037${n}`;
const eq = (name, expected, actual) =>
  results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
const as = async (who, sql) => {
  try {
    await m.query(`select set_config('request.jwt.claim.sub', '${who}', false)`);
    await m.query("set role authenticated");
    const r = await m.query(sql);
    await m.exec("reset role;");
    return String(Object.values(r.rows[0] ?? {})[0] ?? "");
  } catch (e) { await m.exec("reset role;").catch(() => {}); return `ERROR: ${e.message}`; }
};
const put = (who, name) => as(who, `with i as (insert into storage.objects (bucket_id, name) values ('meow-site-assets', '${name}') returning 1) select count(*) from i`);
const list = (who) => as(who, `select count(*) from storage.objects where bucket_id = 'meow-site-assets' and name like 'videos/trailer/%'`);

try {
  await m.exec(read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets"].map((f) => read(`../migrations/${f}.sql`)).join(""));
  await m.exec(read("../migrations/0037_meow_trailer_frames.sql"));
  await m.exec(read("../migrations/0037_meow_trailer_frames.sql"));
  await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'sa@t37.example'), ('${id("a1")}', 'ad@t37.example'), ('${id("a2")}', 'x@t37.example');
    insert into public.meow_profiles (id, email, role) values ('${id("a0")}', 'sa@t37.example', 'system_admin'), ('${id("a1")}', 'ad@t37.example', 'admin'), ('${id("a2")}', 'x@t37.example', 'member');`);
  eq("TRL-1 管理員可在 videos/trailer/ 新增分鏡圖", "1", await put(id("a1"), "videos/trailer/s01__20261118080000.webp"));
  eq("TRL-2 系統管理員照舊可以新增", "1", await put(id("a0"), "videos/trailer/s02__20261118080000.webp"));
  eq("TRL-3 管理員列得到 videos/trailer/ 的檔案", "2", await list(id("a1")));
  eq("TRL-4 一般會員不能新增", true, (await put(id("a2"), "videos/trailer/s03__20261118080000.webp")).startsWith("ERROR"));
  eq("TRL-5 一般會員列不到", "0", await list(id("a2")));
  eq("TRL-6 管理員不能放到 videos/trailer/ 以外（例如 logos/）", true, (await put(id("a1"), "logos/9-x.png")).startsWith("ERROR"));
  eq("TRL-7 管理員不能刪除分鏡圖", "0", await as(id("a1"), `with d as (delete from storage.objects where bucket_id = 'meow-site-assets' and name like 'videos/trailer/%' returning 1) select count(*) from d`));
  eq("TRL-8 policy 名稱以 meow: 開頭", "0", String(Object.values((await m.query(`select count(*) from pg_policies where schemaname = 'storage' and policyname not like 'meow:%'`)).rows[0])[0]));
} catch (e) {
  console.error(`✗ 0037 測試中斷：${e.message}`);
  process.exit(1);
}

let failed = 0;
for (const r of results) {
  if (r.status === "FAIL") failed++;
  console.log(`${r.status}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
console.log(`\nPASS ${results.length - failed}｜FAIL ${failed}`);
if (failed || results.length === 0) process.exit(1);
