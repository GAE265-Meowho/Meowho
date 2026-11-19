// 0041（前導影片分鏡表編修，#513）：0001→0003 後跑 0038 兩次，在記憶體內的 PGlite 驗證，不會連到任何 Supabase 專案。
// 用法：node supabase/tests/run-pglite-0041.mjs（需要 @electric-sql/pglite，同 run-pglite.mjs）
// 涵蓋（權限繼承影片頁：所有管理員）：管理員新增、查看、刪除；不能冒用別人名義；一般會員看不到、不能新增或刪除；不能修改；欄位檢查
import { readFileSync } from "node:fs";

const { PGlite } = await import("@electric-sql/pglite");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const results = [];
const m = new PGlite();
const id = (n) => `00000000-0000-0000-0000-0000000041${n}`;
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
const add = (who, extra = "") => as(who, `with i as (insert into public.meow_trailer_script_edits (target, field, value${extra ? ", created_by" : ""}) values ('s07', 'picture', '阿芳家，拍小橘吃飯'${extra ? `, '${extra}'` : ""}) returning 1) select count(*) from i`);
const count = (who) => as(who, "select count(*) from public.meow_trailer_script_edits");
const isErr = (s) => s.startsWith("ERROR");

try {
  await m.exec(read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets"].map((f) => read(`../migrations/${f}.sql`)).join(""));
  await m.exec(read("../migrations/0041_meow_trailer_script_edits.sql"));
  await m.exec(read("../migrations/0041_meow_trailer_script_edits.sql"));
  await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'sa@t41.example'), ('${id("a1")}', 'ad@t41.example'), ('${id("a2")}', 'ad2@t41.example'), ('${id("a3")}', 'x@t41.example');
    insert into public.meow_profiles (id, email, role) values ('${id("a0")}', 'sa@t41.example', 'system_admin'), ('${id("a1")}', 'ad@t41.example', 'admin'), ('${id("a2")}', 'ad2@t41.example', 'admin'), ('${id("a3")}', 'x@t41.example', 'member');`);
  eq("EDIT-1 管理員可以新增紀錄（created_by 自動帶自己）", "1", await add(id("a1")));
  eq("EDIT-2 另一位管理員看得到", "1", await count(id("a2")));
  eq("EDIT-3 不能用別人的名義新增", true, isErr(await add(id("a1"), id("a2"))));
  eq("EDIT-4 一般會員不能新增", true, isErr(await add(id("a3"))));
  eq("EDIT-5 一般會員看不到", "0", await count(id("a3")));
  eq("EDIT-6 不能修改（要改就新增一筆）", true, isErr(await as(id("a1"), "update public.meow_trailer_script_edits set value = 'x' returning 1")) || (await as(id("a1"), "with u as (update public.meow_trailer_script_edits set value = 'x' returning 1) select count(*) from u")) === "0");
  eq("EDIT-7 欄位只能是畫面、旁白、音效、中文 prompt", true, isErr(await as(id("a1"), "insert into public.meow_trailer_script_edits (target, field, value) values ('s07', 'time', '0:00') returning 1")));
  eq("EDIT-7b 代號格式要像 s07 或 s07-1", true, isErr(await as(id("a1"), "insert into public.meow_trailer_script_edits (target, field, value) values ('../x', 'picture', 'v') returning 1")));
  eq("EDIT-7c value 可為 null（還原原稿）", "1", await as(id("a1"), "with i as (insert into public.meow_trailer_script_edits (target, field, value) values ('s07-1', 'zh_prompt', null) returning 1) select count(*) from i"));
  eq("EDIT-8 內容超過 3000 字會擋", true, isErr(await as(id("a1"), `insert into public.meow_trailer_script_edits (target, field, value) values ('s07', 'picture', repeat('x', 3001)) returning 1`)));
  eq("EDIT-9 一般會員不能刪", "0", await as(id("a3"), "with d as (delete from public.meow_trailer_script_edits returning 1) select count(*) from d"));
  eq("EDIT-10 其他管理員也能刪（權限繼承頁面）", "2", await as(id("a2"), "with d as (delete from public.meow_trailer_script_edits returning 1) select count(*) from d"));
  await add(id("a1"));
  eq("EDIT-11 系統管理員可以刪", "1", await as(id("a0"), "with d as (delete from public.meow_trailer_script_edits returning 1) select count(*) from d"));
  eq("EDIT-12 RLS 已啟用", "true", String(Object.values((await m.query("select relrowsecurity from pg_class where relname = 'meow_trailer_script_edits'")).rows[0])[0]));
} catch (e) {
  console.error(`✗ 0041 測試中斷：${e.message}`);
  process.exit(1);
}

let failed = 0;
for (const r of results) {
  if (r.status === "FAIL") failed++;
  console.log(`${r.status}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
console.log(`\nPASS ${results.length - failed}｜FAIL ${failed}`);
if (failed || results.length === 0) process.exit(1);
