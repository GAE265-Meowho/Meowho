import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const migrationFiles = [
  "0001_meow.sql", "0002_meow_hq.sql", "0003_meow_site_assets.sql",
  "0004_meow_cat_profile.sql", "0005_meow_cat_models.sql", "0006_meow_household_roles.sql",
  "0007_meow_adoption_forms.sql", "0008_meow_cat_favorites.sql", "0009_meow_cat_returns.sql",
  "0010_meow_adoption_notify.sql", "0011_meow_threads.sql", "0012_meow_thread_homed.sql",
  "0013_meow_decline_reason_transfer.sql", "0014_meow_room_models.sql", "0014_meow_returns_in_threads.sql",
  "0015_meow_room_floorplan.sql", "0016_meow_cat_model_variants.sql", "0017_meow_adoption_tasks.sql",
  "0018_meow_task_templates_seed.sql", "0019_meow_household_avatar.sql", "0020_meow_households_module.sql",
  "0022_meow_home_storage_fix.sql",
];

const id = (suffix) => `00000000-0000-0000-0000-${String(`29${suffix}`).padStart(12, "0")}`;
const one = async (db, sql) => Object.values((await db.query(sql)).rows[0] ?? {})[0];
const check = (name, expected, actual) => {
  if (String(actual) !== String(expected)) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  console.log(`PASS ${name}`);
};
const errorCode = async (promise) => {
  try { await promise; return "no_error"; } catch (error) { return error.message; }
};

const db = new PGlite();
await db.exec(read("./stub_supabase.sql"));
for (const file of migrationFiles) await db.exec(read(`../migrations/${file}`));
await db.exec(read("../migrations/0031_meow_env_jobs.sql"));
await db.exec(read("../migrations/0031_meow_env_jobs.sql"));
await db.exec(read("../migrations/0033_meow_env_notifications.sql"));
await db.exec(read("../migrations/0033_meow_env_notifications.sql"));

await db.exec(`
  insert into auth.users (id, email) values ('${id("001")}', 'env29@example.test');
  insert into auth.users (id, email) values ('${id("002")}', 'other-owner@example.test');
  insert into public.meow_profiles (id, email, display_name) values
    ('${id("001")}', 'env29@example.test', 'env29'),
    ('${id("002")}', 'other-owner@example.test', 'other-owner');
  insert into public.meow_households (id, owner_id, name, caretaker_type, city, district)
    values ('${id("101")}', '${id("001")}', '測試喵戶', 'cat_owner', '桃園市', '中壢區'),
           ('${id("102")}', '${id("002")}', '其他喵戶', 'cat_owner', '桃園市', '中壢區');
  insert into public.meow_room_models (id, name, status, video_path, created_by)
    values ('room_20261106_290001', '測試房間', 'queued', 'homes/${id("101")}/videos/${id("201")}.mp4', '${id("001")}');
  insert into public.meow_home_videos (id, household_id, path, purpose, status, size_bytes, duration_s, uploaded_at)
    values ('${id("201")}', '${id("101")}', 'homes/${id("101")}/videos/${id("201")}.mp4', 'room', 'uploaded', 1024, 12.5, now());
`);

const created = await db.query(`select * from public.meow_create_home_processing('${id("201")}', 'room_20261106_290001', '${id("901")}')`);
check("建立 room + env 工作", 1, created.rows.length);
check("新 env job 複製來源影片路徑供清理", `homes/${id("101")}/videos/${id("201")}.mp4`, await one(db, `select video_path from public.meow_env_jobs where video_id = '${id("201")}'`));
check("env job queued", "queued", await one(db, `select status from public.meow_env_jobs where video_id = '${id("201")}'`));
check("room job queued", "queued", await one(db, "select status from public.meow_room_jobs where room_id = 'room_20261106_290001'"));
const retry = await db.query(`select * from public.meow_create_home_processing('${id("201")}', 'room_20261106_290001', '${id("901")}')`);
check("重試不重複建立", 1, retry.rows.length);
check("只有一筆 env job", 1, await one(db, `select count(*) from public.meow_env_jobs where video_id = '${id("201")}'`));
check("authenticated 不可執行排程 RPC", false, await one(db, `select has_function_privilege('authenticated', 'public.meow_create_home_processing(uuid,text,uuid)', 'execute')`));
check("authenticated 不可執行 Worker RPC", false, await one(db, `select has_function_privilege('authenticated', 'public.meow_env_claim(text)', 'execute')`));
check("authenticated 不可執行 complete Worker RPC", false, await one(db, `select has_function_privilege('authenticated', 'public.meow_env_complete(uuid,integer,text,jsonb,jsonb,text,text)', 'execute')`));
check("authenticated 不可執行 fail Worker RPC", false, await one(db, `select has_function_privilege('authenticated', 'public.meow_env_fail(uuid,integer,text,text,boolean)', 'execute')`));
check("service_role 可執行 Worker RPC", true, await one(db, `select has_function_privilege('service_role', 'public.meow_env_claim(text)', 'execute')`));
check("所有 PR A SECURITY DEFINER 都固定安全 search_path", 9, await one(db, `select count(*) from pg_proc where pronamespace='public'::regnamespace and prosecdef and proname in ('meow_env_path_ok','meow_create_home_processing','meow_env_claim','meow_env_renew','meow_env_complete','meow_env_fail','meow_env_cancel_on_report_delete','meow_env_cancel_on_household_delete','meow_env_cancel_on_video_delete') and proconfig @> array['search_path=pg_catalog, public']`));
check("通知 trigger 是 SECURITY DEFINER 且 search_path 固定", true, await one(db, `select prosecdef and proconfig @> array['search_path=pg_catalog, public'] from pg_proc where proname='meow_notify_env_job_terminal'`));
check("通知 trigger function 不可由 service_role 直接呼叫", false, await one(db, `select has_function_privilege('service_role', 'public.meow_notify_env_job_terminal()', 'execute')`));
await db.query("set role authenticated");
const memberCall = await errorCode(db.query(`select public.meow_create_home_processing('${id("201")}', 'room_20261106_290001', '${id("902")}')`));
await db.query("reset role");
check("authenticated 直接呼叫排程 RPC 被拒", true, memberCall.includes("permission denied"));
await db.query("set role authenticated");
const memberFailCall = await errorCode(db.query(`select public.meow_env_fail('${id("999")}', 1, 'timeout', 'x', false)`));
await db.query("reset role");
check("authenticated 直接呼叫 fail Worker RPC 被拒", true, memberFailCall.includes("permission denied"));
await db.query("set role authenticated");
const memberCompleteCall = await errorCode(db.query(`select public.meow_env_complete('${id("999")}', 1, '摘要', '[]', '[]', 'x', 'y')`));
await db.query("reset role");
check("authenticated 直接呼叫 complete Worker RPC 被拒", true, memberCompleteCall.includes("permission denied"));

const claim = await one(db, `select public.meow_env_claim('worker-a')`);
check("claim 回傳 job", id("201"), (claim?.video_id ?? claim?.source_video_id));
const job = await db.query(`select id, attempt, status, lease_until from public.meow_env_jobs where video_id = '${id("201")}'`);
const jobId = job.rows[0].id;
const attempt = job.rows[0].attempt;
check("attempt 從 0 變 1", 1, attempt);
check("job running", "running", job.rows[0].status);
await db.query(`select public.meow_env_renew('${jobId}', ${attempt}, 'analyze')`);
check("續租更新 step", "analyze", await one(db, `select step from public.meow_env_jobs where id = '${jobId}'`));

await db.exec(`update public.meow_env_jobs set lease_until = now() - interval '1 second' where id = '${jobId}'`);
const stale = await errorCode(db.query(`select public.meow_env_complete('${jobId}', ${attempt}, 'x', '[]', '[]', 'homes/${id("101")}/reports/r/a1/result.json', 'homes/${id("101")}/reports/r/a1/report.pdf')`));
check("過期 attempt 不可結案", "env_lease_expired", stale);

const fail = await errorCode(db.query(`select public.meow_env_fail('${jobId}', ${attempt}, 'timeout', '暫時失敗', true)`));
check("過期 attempt fail 拒絕", "env_lease_expired", fail);
check("過期 attempt 拒絕後不發通知", 0, await one(db, `select count(*) from public.meow_notifications where dedupe_key like 'env_job:${jobId}:%'`));
await db.exec(`update public.meow_env_jobs set max_attempts = 1 where id = '${jobId}'`);
check("租約耗盡後 claim 結束工作但不外洩技術細節", null, await one(db, `select public.meow_env_claim('worker-exhausted')`));
check("租約耗盡使用契約系統錯誤訊息", "我們這邊出了問題，修好會通知你，不要求重拍。", await one(db, `select error from public.meow_env_reports where id = (select report_id from public.meow_env_jobs where id = '${jobId}')`));
check("租約耗盡終態只通知該 Household Owner", 1, await one(db, `select count(*) from public.meow_notifications where dedupe_key = 'env_job:${jobId}:failed' and user_id = '${id("001")}'`));
check("租約耗盡通知類型、標題、內容與連結正確", 1, await one(db, `select count(*) from public.meow_notifications where dedupe_key = 'env_job:${jobId}:failed' and type = 'home_safety_failed' and title = '安全報告沒有產生成功' and body = '請稍後重新檢測；若畫面提示影片不符合拍攝須知，再重新拍攝即可。' and link = '/homes/${id("101")}/safety'`));
check("通知不寄給其他 Household Owner", 0, await one(db, `select count(*) from public.meow_notifications where dedupe_key = 'env_job:${jobId}:failed' and user_id = '${id("002")}'`));

await db.exec(`
  insert into public.meow_home_videos (id, household_id, path, purpose, status, size_bytes, duration_s, uploaded_at)
    values ('${id("202")}', '${id("101")}', 'homes/${id("101")}/videos/${id("202")}.mp4', 'safety', 'uploaded', 2048, 8, now());
`);
await db.query(`select public.meow_create_home_processing('${id("202")}', null, '${id("902")}')`);
const safetyClaim = await one(db, `select public.meow_env_claim('worker-b')`);
const safetyJob = await one(db, `select id from public.meow_env_jobs where video_id = '${id("202")}'`);
check("claim output_prefix 對應報告資料夾與 attempt", `homes/${id("101")}/reports/${safetyClaim.report_id}/a1/`, safetyClaim.output_prefix);
const safetyAttempt = await one(db, `select attempt from public.meow_env_jobs where id = '${safetyJob}'`);
const jsonPath = `homes/${id("101")}/reports/${await one(db, `select report_id from public.meow_env_jobs where id = '${safetyJob}'`)}/a${safetyAttempt}/result.json`;
const pdfPath = jsonPath.replace("result.json", "report.pdf");
const done = await one(db, `select public.meow_env_complete('${safetyJob}', ${safetyAttempt}, '完成', '[]', '[]', '${jsonPath}', '${pdfPath}')`);
check("完整成果可結案", "done", done);
check("報告 ready", "ready", await one(db, `select status from public.meow_env_reports where video_id = '${id("202")}'`));
const already = await one(db, `select public.meow_env_complete('${safetyJob}', ${safetyAttempt}, '完成', '[]', '[]', '${jsonPath}', '${pdfPath}')`);
check("complete 冪等", "already_done", already);
check("第一次 done 通知正確 Owner 且只一則", 1, await one(db, `select count(*) from public.meow_notifications where dedupe_key = 'env_job:${safetyJob}:done' and user_id = '${id("001")}' and type = 'home_safety_ready' and title = '你家的安全報告好了' and link = '/homes/${id("101")}/safety'`));
check("重複 complete 不重複通知", 1, await one(db, `select count(*) from public.meow_notifications where dedupe_key = 'env_job:${safetyJob}:done'`));

await db.exec(`
  insert into public.meow_home_videos (id, household_id, path, purpose, status, size_bytes, duration_s, uploaded_at)
    values ('${id("203")}', '${id("101")}', 'homes/${id("101")}/videos/${id("203")}.mp4', 'safety', 'uploaded', 2048, 8, now());
`);
await db.query(`select public.meow_create_home_processing('${id("203")}', null, '${id("903")}')`);
const retryJob = await one(db, `select id from public.meow_env_jobs where video_id = '${id("203")}'`);
await db.query(`select public.meow_env_claim('worker-c')`);
const requeued = await one(db, `select public.meow_env_fail('${retryJob}', 1, 'timeout', '暫時錯誤', true)`);
check("暫時錯誤重新排隊", "requeued", requeued);
check("可重試失敗不通知", 0, await one(db, `select count(*) from public.meow_notifications where dedupe_key like 'env_job:${retryJob}:%'`));
const retryReportId = await one(db, `select report_id from public.meow_env_jobs where id='${retryJob}'`);
check("暫時性重試不提前永久失敗報告", "queued|null", await one(db, `select status || '|' || coalesce(error, 'null') from public.meow_env_reports where id = '${retryReportId}'`));
check("重試技術細節只保存在 job", "暫時錯誤", await one(db, `select error_detail from public.meow_env_jobs where id = '${retryJob}'`));
check("fail 冪等", "requeued", await one(db, `select public.meow_env_fail('${retryJob}', 1, 'timeout', '暫時錯誤', true)`));
check("重試工作回 queued", "queued", await one(db, `select status from public.meow_env_jobs where id = '${retryJob}'`));
check("重排期間同 attempt complete 回 job_not_running", "env_job_not_running", await errorCode(db.query(`select public.meow_env_complete('${retryJob}', 1, 'x', '[]', '[]', 'homes/${id("101")}/reports/r/a1/result.json', 'homes/${id("101")}/reports/r/a1/report.pdf')`)));
await db.query(`select public.meow_env_claim('worker-c-retry')`);
const invalidComplete = await errorCode(db.query(`select public.meow_env_complete('${retryJob}', 1, 'x', '[]', '[]', 'homes/other/reports/x/a1/result.json', 'homes/other/reports/x/a1/report.pdf')`));
check("新 Worker 領件後舊 attempt 不可結案", "env_attempt_stale", invalidComplete);
check("舊 attempt 不可續租", "env_attempt_stale", await errorCode(db.query(`select public.meow_env_renew('${retryJob}', 1, 'stale')`)));
const retryReport = await one(db, `select report_id from public.meow_env_jobs where id='${retryJob}'`);
const retryPrefix = `homes/${id("101")}/reports/${retryReport}/a2/`;
const rejectResult = async (name, summary, items, warnings, jsonPathArg, pdfPathArg) => {
  const result = await errorCode(db.query(`select public.meow_env_complete('${retryJob}', 2, ${summary}, ${items}, ${warnings}, ${jsonPathArg}, ${pdfPathArg})`));
  check(name, "env_result_invalid", result);
};
const sqlJson = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'`;

const invalidCode = await errorCode(db.query(`select public.meow_env_fail('${retryJob}', 2, 'made_up', '錯誤', false)`));
check("非法 fail code 拒絕", "env_result_invalid", invalidCode);
await rejectResult("重複 item key 拒絕", "'摘要'", "'[ {\"key\":\"dup\",\"label\":\"A\",\"level\":\"high\",\"note\":\"說明\"},{\"key\":\"dup\",\"label\":\"B\",\"level\":\"low\",\"note\":\"說明\"} ]'", "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("風險等級不合法拒絕", "'摘要'", "'[{\"key\":\"x\",\"label\":\"A\",\"level\":\"critical\",\"note\":\"說明\"}]'", "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("額外 item 欄位拒絕", "'摘要'", "'[{\"key\":\"x\",\"label\":\"A\",\"level\":\"low\",\"note\":\"說明\",\"extra\":1}]'", "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("空 summary 拒絕", "' '", "'[]'", "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("summary 超過 2000 字拒絕", "repeat('x', 2001)", "'[]'", "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("null items 拒絕", "'摘要'", "null", "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("null warnings 拒絕", "'摘要'", "'[]'", "null", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("錯誤 crop path 拒絕", "'摘要'", "'[{\"key\":\"x\",\"label\":\"A\",\"level\":\"low\",\"note\":\"說明\",\"crop_path\":\"homes/other/crops/x.jpg\"}]'", "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("items 超過 30 項拒絕", sqlJson("摘要"), sqlJson(Array.from({ length: 31 }, (_, index) => ({ key: `item_${index}`, label: "項目", level: "low", note: "說明" }))), "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("warnings 超過 10 項拒絕", sqlJson("摘要"), "'[]'", sqlJson(Array.from({ length: 11 }, () => ({ code: "low_light", message: "畫面偏暗" }))), `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
await rejectResult("不符合 prefix 的 JSON 路徑拒絕", "'摘要'", "'[]'", "'[]'", "'homes/other/result.json'", `'${retryPrefix}report.pdf'`);
await rejectResult("PDF 必須是唯一必要檔名", "'摘要'", "'[]'", "'[]'", `'${retryPrefix}result.json'`, `'${retryPrefix}preview.pdf'`);
await rejectResult("warning 欄位不得多餘", "'摘要'", "'[]'", "'[{\"code\":\"low_light\",\"message\":\"偏暗\",\"extra\":true}]'", `'${retryPrefix}result.json'`, `'${retryPrefix}report.pdf'`);
check("不可重試錯誤永久失敗", "failed", await one(db, `select public.meow_env_fail('${retryJob}', 2, 'video_not_indoor', '不是室內影片', true)`));
check("最終 failed 通知正確 Owner 與安全連結", 1, await one(db, `select count(*) from public.meow_notifications where dedupe_key = 'env_job:${retryJob}:failed' and user_id = '${id("001")}' and type = 'home_safety_failed' and title = '安全報告沒有產生成功' and body = '請稍後重新檢測；若畫面提示影片不符合拍攝須知，再重新拍攝即可。' and link = '/homes/${id("101")}/safety'`));
check("重複 final fail 回應不重複通知", "failed", await one(db, `select public.meow_env_fail('${retryJob}', 2, 'video_not_indoor', '再次回呼', false)`));
check("重複 final fail 仍只有一則通知", 1, await one(db, `select count(*) from public.meow_notifications where dedupe_key = 'env_job:${retryJob}:failed'`));
check("影片類永久失敗不可由重排 RPC 重試", "env_job_not_requeueable", await errorCode(db.query(`select public.meow_create_home_processing('${id("203")}', null, '${id("888")}')`)));
await db.exec(`insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at) values ('${id("206")}', '${id("101")}', 'homes/${id("101")}/videos/${id("206")}.mp4', 'safety', 'uploaded', now());`);
await db.query(`select public.meow_create_home_processing('${id("206")}', null, '${id("906")}')`);
const systemJob = await one(db, `select id from public.meow_env_jobs where video_id='${id("206")}'`);
await db.query(`select public.meow_env_claim('worker-system')`);
check("系統類永久失敗可由主站新 request 重排", true, await one(db, `select public.meow_env_fail('${systemJob}', 1, 'config_error', '缺少必要設定', false)`)==="failed");
const systemRequeue = await one(db, `select public.meow_create_home_processing('${id("206")}', null, '${id("907")}')`);
check("系統類新工作 attempt 從零開始", 0, await one(db, `select attempt from public.meow_env_jobs where id='${systemRequeue.env_job_id}'`));
const requeuedJob = systemRequeue.env_job_id;
check("系統失敗新工作 attempt 重設", 0, await one(db, `select attempt from public.meow_env_jobs where id='${requeuedJob}'`));
check("新 request 重送冪等", requeuedJob, (await one(db, `select public.meow_create_home_processing('${id("206")}', null, '${id("907")}')`)).env_job_id);

// Report deletion must preserve a canceled tombstone for worker RPC rejection and media cleanup.
const reportPrefixBeforeDelete = await one(db, `select report_storage_prefix from public.meow_env_jobs where id = '${requeuedJob}'`);
await db.query(`delete from public.meow_env_reports where id = (select report_id from public.meow_env_jobs where id = '${requeuedJob}')`);
check("刪報告將 active job 取消", "canceled", await one(db, `select status from public.meow_env_jobs where id = '${requeuedJob}'`));
check("取消 tombstone 保留報告清理前綴", reportPrefixBeforeDelete, await one(db, `select report_storage_prefix from public.meow_env_jobs where id = '${requeuedJob}'`));
check("刪報告後仍保留影片清理路徑", `homes/${id("101")}/videos/${id("206")}.mp4`, await one(db, `select video_path from public.meow_env_jobs where id = '${requeuedJob}'`));
check("取消後 renew 拒絕", "env_job_canceled", await errorCode(db.query(`select public.meow_env_renew('${requeuedJob}', 0, 'late')`)));
check("取消後 complete 拒絕", "env_job_canceled", await errorCode(db.query(`select public.meow_env_complete('${requeuedJob}', 0, 'x', '[]', '[]', '${jsonPath}', '${pdfPath}')`)));
check("取消後 fail 拒絕", "env_job_canceled", await errorCode(db.query(`select public.meow_env_fail('${requeuedJob}', 0, 'timeout', 'late', true)`)));
check("取消工作不產生通知", 0, await one(db, `select count(*) from public.meow_notifications where dedupe_key like 'env_job:${requeuedJob}:%'`));

// Every code listed in v0.4 §4.6 is accepted by the fail RPC.
await db.exec(`insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at) values ('${id("207")}', '${id("101")}', 'homes/${id("101")}/videos/${id("207")}.mp4', 'safety', 'uploaded', now());`);
await db.query(`select public.meow_create_home_processing('${id("207")}', null, '${id("908")}')`);
const codeJob = await one(db, `select id from public.meow_env_jobs where video_id='${id("207")}'`);
const codeReport = await one(db, `select report_id from public.meow_env_jobs where id='${codeJob}'`);
const allowedCodes = ['network','rate_limited','service_unavailable','timeout','video_format','video_too_long','video_too_large','video_unreadable','video_not_indoor','source_invalid','config_error','permission_denied','result_invalid','lease_expired'];
const expectedUserError = (code) => {
  if (code.startsWith("video_")) return "安全檢測沒有完成，請照拍攝須知重新拍一次。";
  if (code === "source_invalid") return "影片沒有上傳完整，請重新上傳。";
  if (["network", "rate_limited", "service_unavailable", "timeout"].includes(code)) return "安全檢測暫時無法完成，我們修好後會通知你，不用重拍。";
  return "我們這邊出了問題，修好會通知你，不要求重拍。";
};
for (const code of allowedCodes) {
  await db.exec(`update public.meow_env_jobs set status='running',attempt=1,lease_until=now()+interval '10 minutes',finished_at=null,error_code=null where id='${codeJob}'`);
  const result = await errorCode(db.query(`select public.meow_env_fail('${codeJob}', 1, '${code}', 'contract test', false)`));
  check(`合法 fail code ${code}`, "no_error", result);
  check(`${code} 僅寫入對應繁中飼主訊息`, expectedUserError(code), await one(db, `select error from public.meow_env_reports where id='${codeReport}'`));
  check(`${code} 技術細節僅留在 job`, "contract test", await one(db, `select error_detail from public.meow_env_jobs where id='${codeJob}'`));
}

await db.exec(`update public.meow_env_jobs set status='failed',retryable=false,finished_at=now() where id='${codeJob}'`);

// A queued job whose source became unavailable is failed with a safe message while its tombstone retains the path.
await db.exec(`insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at) values ('${id("209")}', '${id("101")}', 'homes/${id("101")}/videos/${id("209")}.mp4', 'safety', 'uploaded', now());`);
await db.query(`select public.meow_create_home_processing('${id("209")}', null, '${id("909")}')`);
await db.exec(`update public.meow_home_videos set raw_deleted_at=now() where id='${id("209")}'`);
const invalidSourceJob = await one(db, `select id from public.meow_env_jobs where video_id='${id("209")}'`);
check("不可用來源在 claim 時結束且不再派發", null, await one(db, `select public.meow_env_claim('worker-source-invalid')`));
check("claim 的來源錯誤使用安全飼主訊息", "影片沒有上傳完整，請重新上傳。", await one(db, `select error from public.meow_env_reports where video_id='${id("209")}'`));
check("claim 判定不可恢復 source_invalid 時通知正確喵戶", 1, await one(db, `select count(*) from public.meow_notifications where dedupe_key = 'env_job:${invalidSourceJob}:failed' and user_id = '${id("001")}' and link = '/homes/${id("101")}/safety'`));
check("claim 的來源錯誤碼保留", "source_invalid", await one(db, `select error_code from public.meow_env_jobs where id='${invalidSourceJob}'`));
check("來源失敗 tombstone 仍保留影片路徑", `homes/${id("101")}/videos/${id("209")}.mp4`, await one(db, `select video_path from public.meow_env_jobs where id='${invalidSourceJob}'`));

// Simulate a competing unique-key insert to exercise ON CONFLICT + safe result read-back.
await db.exec(`
  insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at)
    values ('${id("211")}', '${id("101")}', 'homes/${id("101")}/videos/${id("211")}.mp4', 'safety', 'uploaded', now()),
           ('${id("212")}', '${id("101")}', 'homes/${id("101")}/videos/${id("212")}.mp4', 'safety', 'uploaded', now());
  create function public.test_race_home_processing_request() returns trigger language plpgsql as $$
  begin
    if pg_catalog.pg_trigger_depth() = 1 and new.request_id = '${id("912")}' then
      insert into public.meow_home_processing_requests(request_id,video_id,env_job_id,room_job_id)
      values(new.request_id,new.video_id,new.env_job_id,new.room_job_id);
    elsif pg_catalog.pg_trigger_depth() = 1 and new.request_id = '${id("913")}' then
      insert into public.meow_home_processing_requests(request_id,video_id,env_job_id,room_job_id)
      values(new.request_id,'${id("202")}','${safetyJob}',null);
    end if;
    return new;
  end $$;
  create trigger test_race_home_processing_request before insert on public.meow_home_processing_requests
    for each row execute function public.test_race_home_processing_request();
`);
const raceResult = await errorCode(db.query(`select public.meow_create_home_processing('${id("211")}', null, '${id("912")}')`));
check("request 唯一鍵衝突時回傳已存在的同一工作", "no_error", raceResult);
const raceJob = await one(db, `select env_job_id from public.meow_home_processing_requests where request_id='${id("912")}'`);
check("request 衝突讀回的工作屬於同一影片", raceJob, await one(db, `select id from public.meow_env_jobs where video_id='${id("211")}'`));
check("request id 綁定不同影片時明確拒絕", "env_request_conflict", await errorCode(db.query(`select public.meow_create_home_processing('${id("212")}', null, '${id("913")}')`)));
check("request 參數衝突回滾新排程", 0, await one(db, `select count(*) from public.meow_env_jobs where video_id='${id("212")}'`));
await db.exec(`drop trigger test_race_home_processing_request on public.meow_home_processing_requests; drop function public.test_race_home_processing_request();`);

// A system failure retry must reuse an already completed room conversion.
await db.exec(`
  insert into public.meow_room_models (id, name, status, video_path, created_by)
    values ('room_20261106_290004', '已完成 3D 的房間', 'ready', 'homes/${id("101")}/videos/${id("210")}.mp4', '${id("001")}');
  insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at)
    values ('${id("210")}', '${id("101")}', 'homes/${id("101")}/videos/${id("210")}.mp4', 'room', 'uploaded', now());
`);
await db.query(`select public.meow_create_home_processing('${id("210")}', 'room_20261106_290004', '${id("910")}')`);
const completedRoomJob = await one(db, `select id from public.meow_room_jobs where room_id='room_20261106_290004'`);
await db.exec(`update public.meow_room_jobs set status='done',finished_at=now() where id='${completedRoomJob}'`);
const env210 = await one(db, `select id from public.meow_env_jobs where video_id='${id("210")}'`);
await db.exec(`update public.meow_env_jobs set status='running',attempt=1,lease_until=now()+interval '10 minutes' where id='${env210}'`);
check("config_error 結束原健檢工作", "failed", await one(db, `select public.meow_env_fail('${env210}',1,'config_error','設定故障細節',false)`));
const envOnlyRetry = await one(db, `select public.meow_create_home_processing('${id("210")}','room_20261106_290004','${id("911")}')`);
check("健檢重排沿用已完成的 3D 工作", completedRoomJob, envOnlyRetry.room_job_id);
check("健檢重排不新增 3D 工作", 1, await one(db, `select count(*) from public.meow_room_jobs where room_id='room_20261106_290004'`));
check("健檢重排只新增一筆 env 工作", 2, await one(db, `select count(*) from public.meow_env_jobs where video_id='${id("210")}'`));
check("重排 env 工作 attempt 從零開始", 0, await one(db, `select attempt from public.meow_env_jobs where id='${envOnlyRetry.env_job_id}'`));
await db.exec(`update public.meow_env_jobs set status='failed',retryable=false,finished_at=now() where id in ('${raceJob}','${envOnlyRetry.env_job_id}')`);

// Deleting source metadata cancels the job but retains the Azure path on the job tombstone.
await db.exec(`insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at) values ('${id("213")}', '${id("101")}', 'homes/${id("101")}/videos/${id("213")}.mov', 'safety', 'uploaded', now());`);
await db.query(`select public.meow_create_home_processing('${id("213")}', null, '${id("914")}')`);
const sourceMetadataJob = await one(db, `select id from public.meow_env_jobs where video_id='${id("213")}'`);
await db.query(`delete from public.meow_home_videos where id='${id("213")}'`);
check("刪來源 metadata 後工作取消", "canceled", await one(db, `select status from public.meow_env_jobs where id='${sourceMetadataJob}'`));
check("刪來源 metadata 後仍保留影片清理路徑", `homes/${id("101")}/videos/${id("213")}.mov`, await one(db, `select video_path from public.meow_env_jobs where id='${sourceMetadataJob}'`));

// Duplicate scheduling with a different valid room must not silently return the old report.
await db.exec(`insert into public.meow_room_models (id, name, status, video_path, created_by) values ('room_20261106_290003', '不同綁定', 'queued', 'homes/${id("101")}/videos/${id("201")}.mp4', '${id("001")}');`);
const mismatch = await errorCode(db.query(`select public.meow_create_home_processing('${id("201")}', 'room_20261106_290003', '${id("904")}')`));
check("重複 video 不可改綁不同 room", "env_request_conflict", mismatch);
check("request key 不可重用到其他 video", "env_request_conflict", await errorCode(db.query(`select public.meow_create_home_processing('${id("202")}', null, '${id("901")}')`)));

// Simulate a late request-record write failure to prove all scheduling rows roll back.
await db.exec(`
  insert into public.meow_room_models (id, name, status, video_path, created_by)
    values ('room_20261106_290002', '回滾測試', 'queued', 'homes/${id("101")}/videos/${id("205")}.mp4', '${id("001")}');
  insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at)
    values ('${id("205")}', '${id("101")}', 'homes/${id("101")}/videos/${id("205")}.mp4', 'room', 'uploaded', now());
  create function public.test_reject_home_processing_request() returns trigger language plpgsql as $$ begin raise exception 'forced request write failure'; end $$;
  create trigger test_reject_home_processing_request before insert on public.meow_home_processing_requests
    for each row execute function public.test_reject_home_processing_request();
`);
check("排程後段失敗可重現", true, (await errorCode(db.query(`select public.meow_create_home_processing('${id("205")}', 'room_20261106_290002', '${id("889")}')`))).includes("forced request write failure"));
check("排程回滾未留下 report", 0, await one(db, `select count(*) from public.meow_env_reports where video_id='${id("205")}'`));
check("排程回滾未留下 env job", 0, await one(db, `select count(*) from public.meow_env_jobs where video_id='${id("205")}'`));
check("排程回滾未留下 room job", 0, await one(db, `select count(*) from public.meow_room_jobs where room_id='room_20261106_290002'`));
await db.exec(`drop trigger test_reject_home_processing_request on public.meow_home_processing_requests; drop function public.test_reject_home_processing_request();`);

await db.exec(`insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at) values ('${id("208")}', '${id("101")}', 'homes/${id("101")}/videos/${id("777")}.mp4', 'safety', 'uploaded', now());`);
check("來源路徑中的 video id 必須吻合資料列", "env_source_invalid", await errorCode(db.query(`select public.meow_create_home_processing('${id("208")}', null, '${id("915")}')`)));

// Household deletion must also keep a canceled tombstone instead of cascading away the job.
await db.exec(`insert into public.meow_home_videos (id, household_id, path, purpose, status, uploaded_at) values ('${id("204")}', '${id("101")}', 'homes/${id("101")}/videos/${id("204")}.mp4', 'safety', 'uploaded', now());`);
await db.query(`select public.meow_create_home_processing('${id("204")}', null, '${id("905")}')`);
const householdJob = await one(db, `select id from public.meow_env_jobs where video_id = '${id("204")}'`);
const concurrentClaims = await Promise.all([db.query(`select public.meow_env_claim('worker-d')`), db.query(`select public.meow_env_claim('worker-e')`)]);
check("並行 claim 只領到唯一佇列工作", 1, concurrentClaims.filter((result) => Object.values(result.rows[0])[0] !== null).length);
await db.query(`delete from public.meow_households where id = '${id("101")}'`);
check("刪喵戶將 active job 取消並保留", "canceled", await one(db, `select status from public.meow_env_jobs where id = '${householdJob}'`));
check("刪喵戶後 job 保留 tombstone", 1, await one(db, `select count(*) from public.meow_env_jobs where id = '${householdJob}'`));
check("刪喵戶後仍保留影片清理路徑", `homes/${id("101")}/videos/${id("204")}.mp4`, await one(db, `select video_path from public.meow_env_jobs where id='${householdJob}'`));
check("刪喵戶後 complete 拒絕", "env_job_canceled", await errorCode(db.query(`select public.meow_env_complete('${householdJob}', 1, 'x', '[]', '[]', '${jsonPath}', '${pdfPath}')`)));

console.log("PASS 0031 env jobs migration suite");
