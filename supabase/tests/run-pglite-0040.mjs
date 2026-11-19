// 0040（#510）：做過領養任務的個人喵戶要刪得掉。0001→0039 後跑 0040 兩次，在記憶體內的 PGlite 驗證，不會連到任何 Supabase 專案。
// 用法：node supabase/tests/run-pglite-0040.mjs（需要 @electric-sql/pglite，同 run-pglite.mjs）
// 背景：刪喵戶會連帶刪房間與安全報告，任務紀錄上的 room_model_id、env_report_id 由外鍵清成空值；
// 0035 的 meow_task_run_guard 把這次連動更新當成本人竄改，拋出 run_not_found，整筆刪除被退回。
// 找不到 0040 時照樣跑（用來重現問題），但一定以失敗結束。
import { readFileSync, existsSync } from "node:fs";

const { PGlite } = await import("@electric-sql/pglite");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const results = [];

const m = new PGlite();
// 同 0035 測試的基礎，再加上會動到刪喵戶的 0031（取消居家檢測工作）與 0035（stub 沒有 storage 函式，其餘不載入）
const files = ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks", "0018_meow_task_templates_seed", "0030_meow_tasks_on_demand", "0031_meow_env_jobs", "0033_meow_play_report", "0035_meow_play_run_state"]
  .map((f) => `${f}.sql`);
const FIX = "../migrations/0040_meow_task_run_guard_cascade.sql";
const hasFix = existsSync(new URL(FIX, import.meta.url));
const id = (n) => `00000000-0000-0000-0000-0000000040${n}`;
const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
const eq = (name, expected, actual) =>
  results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
const as = async (who, sql) => {
  try {
    await m.query(`select set_config('request.jwt.claim.sub', '${who}', false)`);
    const r = await m.query(`set role authenticated`).then(() => m.query(sql));
    await m.exec("reset role;");
    return r;
  } catch (e) { await m.exec("reset role;").catch(() => {}); return e.message; }
};
const code = (r) => String(typeof r === "string" ? r : "ok").match(/run_not_found|[a-z_]+_[a-z_]+|ok/)?.[0];
const ROOM = "room_20261119_100000";

try {
  await m.exec(read("./stub_supabase.sql"));
  for (const f of files) {
    try { await m.exec(read(`../migrations/${f}`)); } catch (e) { throw new Error(`${f}：${e.message}`); }
  }
  if (hasFix) { await m.exec(read(FIX)); await m.exec(read(FIX)); }
  else console.log("（找不到 0040，只重現問題）");

  await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'k@t40.example'), ('${id("a1")}', 'm@t40.example');
    insert into public.meow_profiles (id, email, display_name) values ('${id("a0")}', 'k@t40.example', 'k'), ('${id("a1")}', 'm@t40.example', 'm');
    insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values
      ('${id("d0")}', '${id("a0")}', '中途', 'personal_foster', '桃園市', '龍潭區'),
      ('${id("d1")}', '${id("a1")}', '子哲個人', 'cat_owner', '台北市', '大安區');
    insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values
      ('${id("c0")}', '${id("d0")}', '橘子', 'male', 'adult', 'adoptable'),
      ('${id("c1")}', '${id("d0")}', '妹妹', 'female', 'adult', 'adoptable');
    insert into public.meow_room_models (id, name, status, owner_household_id, completed_at) values
      ('${ROOM}', '客廳', 'ready', '${id("d1")}', now());
    insert into public.meow_env_reports (id, household_id, room_model_id, status) values
      ('${id("e0")}', '${id("d1")}', '${ROOM}', 'ready');`);

  // 一筆完成、一筆進行中
  await as(id("a1"), `select public.meow_start_play_run('${id("c0")}', '${ROOM}')`);
  const done = await one(`select id from public.meow_task_runs where member_id = '${id("a1")}' and status = 'in_progress'`);
  await as(id("a1"), `select public.meow_complete_play_run('${done}', '{"catName":"橘子"}'::jsonb)`);
  await as(id("a1"), `select public.meow_start_play_run('${id("c1")}', '${ROOM}')`);
  const live = await one(`select id from public.meow_task_runs where member_id = '${id("a1")}' and status = 'in_progress'`);
  await as(id("a1"), `update public.meow_task_runs set progress = '{"node": 2}'::jsonb where id = '${live}'`);

  await as(id("a1"), `update public.meow_task_runs set env_report_id = null where id = '${done}'`);
  eq("DEL-1 本人仍不能直接清掉定格的房間與報告", "run_not_found|run_not_found|true",
    [await as(id("a1"), `update public.meow_task_runs set room_model_id = null where id = '${live}'`),
     await as(id("a1"), `update public.meow_task_runs set env_report_id = null where id = '${live}'`)].map(code).join("|")
      + "|" + await one(`select bool_and(room_model_id is not null and env_report_id is not null) from public.meow_task_runs where member_id = '${id("a1")}'`));

  eq("DEL-2 做過任務的個人喵戶刪得掉", "ok", code(await as(id("a1"), `delete from public.meow_households where id = '${id("d1")}'`)));
  eq("DEL-3 喵戶、房間、報告都刪了", "0|0|0",
    await one(`select concat_ws('|', (select count(*) from public.meow_households where id = '${id("d1")}'), (select count(*) from public.meow_room_models where id = '${ROOM}'), (select count(*) from public.meow_env_reports where id = '${id("e0")}'))`));
  eq("DEL-4 任務紀錄跟著帳號留下，房間與報告欄位變空值", "completed|橘子|t|t,in_progress|2|t|t",
    await one(`select string_agg(concat_ws('|', status, coalesce(game_report ->> 'catName', progress ->> 'node'), room_model_id is null, env_report_id is null), ',' order by status) from public.meow_task_runs where member_id = '${id("a1")}'`));
} catch (e) {
  console.error(`✗ 0040 測試中斷：${e.message}`);
  process.exit(1);
}

let failed = 0;
for (const r of results) {
  if (r.status === "FAIL") failed++;
  console.log(`${r.status}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
console.log(`\nPASS ${results.filter((r) => r.status === "PASS").length}｜FAIL ${failed}`);
if (failed || results.length === 0 || !hasFix) process.exit(1);
