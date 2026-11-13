// 0035（領養任務進行中、續玩、放棄、重玩，#354）：0001→0033 後跑 0035 兩次，在記憶體內的 PGlite 驗證，不會連到任何 Supabase 專案。
// 用法：node supabase/tests/run-pglite-0035.mjs（需要 @electric-sql/pglite，同 run-pglite.mjs）
// 涵蓋：開始前檢查、一人一隻、存進度（只能改 progress）、完成寫報告、換貓不寫放棄標籤、貓下架自動 closed、重玩多一筆、舊的 meow_save_play_report 不能呼叫
import { readFileSync } from "node:fs";

const { PGlite } = await import("@electric-sql/pglite");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const results = [];

const m = new PGlite();
const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks", "0018_meow_task_templates_seed", "0030_meow_tasks_on_demand", "0033_meow_play_report"]
  .map((f) => read(`../migrations/${f}.sql`)).join("");
const id = (n) => `00000000-0000-0000-0000-0000000035${n}`;
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
const code = (r) => String(typeof r === "string" ? r : "ok").match(/run_cat_not_ready|household_required|run_in_progress|run_room_not_ready|run_room_pending|run_report_missing|run_report_pending|play_report_invalid|run_not_found|ok/)?.[0];
const ROOM = "room_20261112_100000", ROOM2 = "room_20261112_110000", ROOM3 = "room_20261112_120000";
const start = (who, cat, room) => as(who, `select public.meow_start_play_run('${cat}', '${room}')`);
const active = (who) => one(`select id from public.meow_task_runs where member_id = '${who}' and status = 'in_progress'`);

try {
  await m.exec(base);
  await m.exec(read("../migrations/0035_meow_play_run_state.sql"));
  await m.exec(read("../migrations/0035_meow_play_run_state.sql"));
  await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'k@t35.example'), ('${id("a1")}', 'm@t35.example'), ('${id("a2")}', 'n@t35.example'), ('${id("a3")}', 'o@t35.example');
    insert into public.meow_profiles (id, email, display_name) values ('${id("a0")}', 'k@t35.example', 'k'), ('${id("a1")}', 'm@t35.example', 'm'), ('${id("a2")}', 'n@t35.example', 'n'), ('${id("a3")}', 'o@t35.example', 'o');
    insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values
      ('${id("d0")}', '${id("a0")}', '中途', 'personal_foster', '桃園市', '龍潭區'),
      ('${id("d1")}', '${id("a1")}', '我家', 'cat_owner', '台北市', '大安區'),
      ('${id("d3")}', '${id("a3")}', '中途家', 'personal_foster', '台北市', '大安區');
    insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values
      ('${id("c0")}', '${id("d0")}', '橘子', 'male', 'adult', 'adoptable'),
      ('${id("c1")}', '${id("d0")}', '妹妹', 'female', 'adult', 'adoptable');
    insert into public.meow_room_models (id, name, status, owner_household_id, completed_at) values
      ('${ROOM}', '客廳', 'ready', '${id("d1")}', now()),
      ('${ROOM2}', '臥室', 'running', '${id("d1")}', null),
      ('${ROOM3}', '書房', 'ready', '${id("d1")}', now());
    insert into public.meow_env_reports (id, household_id, room_model_id, status) values
      ('${id("e0")}', '${id("d1")}', '${ROOM}', 'ready'),
      ('${id("e1")}', '${id("d1")}', '${ROOM3}', 'running');`);

  eq("RUN-1 只有中途喵戶不能玩", "household_required", code(await start(id("a3"), id("c0"), ROOM)));
  eq("RUN-2 沒有喵戶不能玩", "household_required", code(await start(id("a2"), id("c0"), ROOM)));
  eq("RUN-3 房間還在處理中要等", "run_room_pending", code(await start(id("a1"), id("c0"), ROOM2)));
  eq("RUN-4 安全報告還在處理中要等", "run_report_pending", code(await start(id("a1"), id("c0"), ROOM3)));
  eq("RUN-5 不是自己的房間", "household_required", code(await start(id("a2"), id("c0"), ROOM)));

  await start(id("a1"), id("c0"), ROOM);
  eq("RUN-6 開始成功、建一筆進行中並定格房間與報告", `in_progress|${ROOM}|${id("e0")}`,
    await one(`select status || '|' || room_model_id || '|' || env_report_id from public.meow_task_runs where member_id = '${id("a1")}'`));
  const runId = await active(id("a1"));
  eq("RUN-7 同一隻再按開始回傳原本那筆", runId, (await start(id("a1"), id("c0"), ROOM))?.rows?.[0]?.meow_start_play_run);
  eq("RUN-8 正在做別隻貓不能開始", "run_in_progress", code(await start(id("a1"), id("c1"), ROOM)));
  await as(id("a1"), `update public.meow_task_runs set progress = '{"node": 2}'::jsonb where id = '${runId}'`);
  eq("RUN-9 進度存得進去（本人直接 update 進行中那筆）", "2", await one(`select progress ->> 'node' from public.meow_task_runs where id = '${runId}'`));

  eq("RUN-9b 本人不能直接改定格的房間、報告與試養報告", `run_not_found|run_not_found|run_not_found|${ROOM}|${id("e0")}`,
    [await as(id("a1"), `update public.meow_task_runs set room_model_id = '${ROOM3}' where id = '${runId}'`),
     await as(id("a1"), `update public.meow_task_runs set env_report_id = null where id = '${runId}'`),
     await as(id("a1"), `update public.meow_task_runs set game_report = '{"x":1}'::jsonb where id = '${runId}'`)].map(code).join("|")
      + "|" + await one(`select room_model_id || '|' || env_report_id from public.meow_task_runs where id = '${runId}'`));
  await as(id("a1"), `select public.meow_switch_task_run('${runId}')`);
  eq("RUN-10 換貓：結束進行中那筆、不寫放棄標籤", "closed|0",
    await one(`select r.status || '|' || (select count(*) from public.meow_task_abandons) from public.meow_task_runs r where r.id = '${runId}'`));
  eq("RUN-11 結束之後可以開始別隻貓", "ok", code(await start(id("a1"), id("c1"), ROOM)));
  const run2 = await active(id("a1"));
  await as(id("a1"), `select public.meow_abandon_task_run('${run2}', array['not_ready'], null)`);
  eq("RUN-12 同一隻貓按放棄要寫標籤", "1", await one(`select count(*) from public.meow_task_abandons where run_id = '${run2}'`));

  await start(id("a1"), id("c0"), ROOM);
  const run3 = await active(id("a1"));
  await as(id("a1"), `select public.meow_complete_play_run('${run3}', '{"catName":"橘子"}'::jsonb)`);
  eq("RUN-13 完成：寫入報告、狀態 completed", "completed|橘子", await one(`select status || '|' || (game_report ->> 'catName') from public.meow_task_runs where id = '${run3}'`));
  eq("RUN-14 已完成的不能再完成、報告不是物件不能存", "run_not_found|play_report_invalid",
    `${code(await as(id("a1"), `select public.meow_complete_play_run('${run3}', '{}'::jsonb)`))}|${code(await as(id("a1"), `select public.meow_complete_play_run('${run3}', '[1]'::jsonb)`))}`);

  await start(id("a1"), id("c0"), ROOM);
  const run4 = await active(id("a1"));
  await as(id("a1"), `select public.meow_complete_play_run('${run4}', '{"catName":"橘子","n":2}'::jsonb)`);
  eq("RUN-15 重玩不覆蓋：兩筆完成紀錄", "2", await one(`select count(*) from public.meow_task_runs where member_id = '${id("a1")}' and cat_id = '${id("c0")}' and status = 'completed'`));
  await m.exec(`insert into public.meow_threads (id, cat_id, member_id, household_id, cat_name, household_name, member_name) values ('${id("f0")}', '${id("c0")}', '${id("a1")}', '${id("d0")}', '橘子', '中途', 'm')`);
  eq("RUN-16 對話串回報完成 2 次", "2", (await as(id("a0"), `select public.meow_thread_task_status('${id("f0")}') as s`))?.rows?.[0]?.s?.completed_count);

  await start(id("a1"), id("c1"), ROOM);
  await m.exec(`select set_config('meow.cat_flow', 'on', false); update public.meow_cats set status = 'adopted' where id = '${id("c1")}'; select set_config('meow.cat_flow', '', false);`);
  eq("RUN-17 貓不再待領養：進行中自動 closed、沒有放棄標籤", "closed|0",
    await one(`select r.status || '|' || (select count(*) from public.meow_task_abandons a where a.run_id = r.id) from public.meow_task_runs r where r.cat_id = '${id("c1")}' order by r.started_at desc limit 1`));
  eq("RUN-18 領養人收到通知", "1", await one(`select count(*) from public.meow_notifications where user_id = '${id("a1")}' and type = 'task'`));
  eq("RUN-19 登入的會員可以執行、未登入不行", "t|f",
    await one(`select concat_ws('|', has_function_privilege('authenticated', 'public.meow_start_play_run(uuid,text)', 'execute'), has_function_privilege('anon', 'public.meow_start_play_run(uuid,text)', 'execute'))`));
  eq("RUN-20 舊的 meow_save_play_report 不再開放呼叫", "false",
    await one(`select has_function_privilege('authenticated', 'public.meow_save_play_report(uuid,text,jsonb)', 'execute')`));
} catch (e) {
  console.error(`✗ 0035 測試中斷：${e.message}`);
  process.exit(1);
}

let failed = 0;
for (const r of results) {
  if (r.status === "FAIL") failed++;
  console.log(`${r.status}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
console.log(`\nPASS ${results.filter((r) => r.status === "PASS").length}｜FAIL ${failed}`);
if (failed || results.length === 0) process.exit(1);
