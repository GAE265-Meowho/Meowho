// 在本機臨時資料庫（PGlite，記憶體內）依序執行：模擬環境 → 0001 → 0002（連跑兩次）→ 0002 測試，不會連到任何 Supabase 專案。
// 用法：
//   npm i --no-save @electric-sql/pglite     （不會改 package.json）
//   node supabase/tests/run-pglite.mjs
// 結果：每個案例印出 PASS／FAIL／SKIP，任何 FAIL 會讓程式以非 0 結束。
import { readFileSync, existsSync } from "node:fs";

const { PGlite } = await import("@electric-sql/pglite");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const db = new PGlite();
const run = async (label, sql) => {
  try {
    return await db.exec(sql);
  } catch (e) {
    console.error(`✗ ${label} 失敗：${e.message}`);
    process.exit(1);
  }
};

await run("stub_supabase.sql", read("./stub_supabase.sql"));
await run("0001_meow.sql", read("../migrations/0001_meow.sql"));

if (!existsSync(new URL("../migrations/0002_meow_hq.sql", import.meta.url))) {
  console.error("✗ 找不到 supabase/migrations/0002_meow_hq.sql（測試先寫、migration 還沒寫時會停在這裡）");
  process.exit(1);
}
await run("0002_meow_hq.sql（第 1 次）", read("../migrations/0002_meow_hq.sql"));
await run("0002_meow_hq.sql（第 2 次）", read("../migrations/0002_meow_hq.sql"));

// 遷移與可重複執行（另開一個資料庫）：舊的 admin 升級為 system_admin；之後新設的「管理員」重跑不會被再升級
{
  const m = new PGlite();
  const q = async (sql) => (await m.query(sql)).rows;
  await m.exec(read("./stub_supabase.sql") + read("../migrations/0001_meow.sql"));
  await m.exec(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tina@test.example'), ('00000000-0000-0000-0000-000000000002', 'mgr@test.example');
    insert into public.meow_profiles (id, email, role) values ('00000000-0000-0000-0000-000000000001', 'tina@test.example', 'admin');`);
  await m.exec(read("../migrations/0002_meow_hq.sql"));
  const first = await q("select role from public.meow_profiles where email = 'tina@test.example'");
  await m.exec(`insert into public.meow_profiles (id, email, role) values ('00000000-0000-0000-0000-000000000002', 'mgr@test.example', 'admin');`);
  await m.exec(read("../migrations/0002_meow_hq.sql"));
  const roles = Object.fromEntries((await q("select email, role from public.meow_profiles")).map((r) => [r.email, r.role]));
  const ok = first[0]?.role === "system_admin" && roles["tina@test.example"] === "system_admin" && roles["mgr@test.example"] === "admin";
  console.log(`${ok ? "PASS" : "FAIL"}  遷移：舊 admin → system_admin；重跑 migration 不會把後來的管理員再升級`);
  if (!ok) process.exit(1);
}

// 測試檔給 psql 用時有 begin／rollback，這裡是一次性記憶體資料庫，去掉即可
const testSql = read("./0002_meow_hq.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
let results = [];
try {
  const out = await db.exec(testSql);
  results = out.flatMap((r) => r.rows ?? []).filter((r) => "status" in r);
} catch (e) {
  console.error(`✗ 測試中斷：${e.message}`);
  process.exit(1);
}

// 0003（網站外觀，Issue #23）：另開一個資料庫，0001 → 0002 → 0003（連跑兩次）→ 0003 測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + read("../migrations/0001_meow.sql") + read("../migrations/0002_meow_hq.sql");
  if (!existsSync(new URL("../migrations/0003_meow_site_assets.sql", import.meta.url))) {
    console.error("✗ 找不到 supabase/migrations/0003_meow_site_assets.sql");
    process.exit(1);
  }
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0003_meow_site_assets.sql"));
    await m.exec(read("../migrations/0003_meow_site_assets.sql"));
    const sql3 = read("./0003_meow_site_assets.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out3 = await m.exec(sql3);
    results = results.concat(out3.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0003 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0004（貓咪 profile，#57）：另開一個資料庫，0001 → 0002 → 0003 → 0004（連跑兩次）→ 0004 測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + read("../migrations/0001_meow.sql") + read("../migrations/0002_meow_hq.sql") + read("../migrations/0003_meow_site_assets.sql");
  if (!existsSync(new URL("../migrations/0004_meow_cat_profile.sql", import.meta.url))) {
    console.error("✗ 找不到 supabase/migrations/0004_meow_cat_profile.sql");
    process.exit(1);
  }
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0004_meow_cat_profile.sql"));
    await m.exec(read("../migrations/0004_meow_cat_profile.sql"));
    const sql4 = read("./0004_meow_cat_profile.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out4 = await m.exec(sql4);
    results = results.concat(out4.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0004 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0005（貓咪模型，#75）：0001→0004 後跑 0005 兩次＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + read("../migrations/0001_meow.sql") + read("../migrations/0002_meow_hq.sql")
    + read("../migrations/0003_meow_site_assets.sql") + read("../migrations/0004_meow_cat_profile.sql");
  if (!existsSync(new URL("../migrations/0005_meow_cat_models.sql", import.meta.url))) {
    console.error("✗ 找不到 supabase/migrations/0005_meow_cat_models.sql");
    process.exit(1);
  }
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0005_meow_cat_models.sql"));
    await m.exec(read("../migrations/0005_meow_cat_models.sql"));
    const sql5 = read("./0005_meow_cat_models.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out5 = await m.exec(sql5);
    results = results.concat(out5.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0005 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0016（#104）：在記憶體資料庫驗證舊貼圖分流與重跑不覆寫，不連正式 Supabase。
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models"]
    .map(n => read(`../migrations/${n}.sql`)).join("\n");
  try {
    await m.exec(base);
    await m.exec(`insert into public.meow_cat_models
      (id,name,owner_type,status,profile,photo_path,albedo_path,prev_albedo_path,base_version,meta)
      values ('cat_20261102_040323','橘寶','template','ready',
      '{"age_months":3,"confirmed_albedo":"adult.png"}','photo.png','kitten.png','adult.png','kitten-v1',
      '{"prev_base_version":"v1"}');`);
    await m.exec(read("../migrations/0016_meow_cat_model_variants.sql"));
    await m.exec(read("../migrations/0016_meow_cat_model_variants.sql"));
    const { rows } = await m.query(`select body_type,albedo_path,confirmed_albedo from public.meow_cat_model_variants
      where model_id='cat_20261102_040323' order by body_type`);
    const ok = rows.length === 2 && rows[0].body_type === "adult" && rows[0].albedo_path === "adult.png"
      && rows[0].confirmed_albedo === "adult.png" && rows[1].body_type === "kitten"
      && rows[1].albedo_path === "kitten.png" && rows[1].confirmed_albedo === null;
    console.log(`${ok ? "PASS" : "FAIL"}  0016：舊成貓與幼貓分流且可重跑`);
    if (!ok) process.exit(1);
  } catch (e) {
    console.error(`✗ 0016 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0006（依身分建立喵戶、貓咪送養文欄位，#82）：0001→0005 後跑 0006 兩次＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + read("../migrations/0001_meow.sql") + read("../migrations/0002_meow_hq.sql")
    + read("../migrations/0003_meow_site_assets.sql") + read("../migrations/0004_meow_cat_profile.sql") + read("../migrations/0005_meow_cat_models.sql");
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0006_meow_household_roles.sql"));
    await m.exec(read("../migrations/0006_meow_household_roles.sql"));
    const sql6 = read("./0006_meow_household_roles.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out6 = await m.exec(sql6);
    results = results.concat(out6.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0006 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0007（領養問卷，#89）：0001→0006 後跑 0007 兩次＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0007_meow_adoption_forms.sql"));
    await m.exec(read("../migrations/0007_meow_adoption_forms.sql"));
    const sql7 = read("./0007_meow_adoption_forms.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out7 = await m.exec(sql7);
    results = results.concat(out7.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0007 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0008（收藏貓咪，#70）：0001→0007 後跑 0008 兩次＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0008_meow_cat_favorites.sql"));
    await m.exec(read("../migrations/0008_meow_cat_favorites.sql"));
    const sql8 = read("./0008_meow_cat_favorites.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out8 = await m.exec(sql8);
    results = results.concat(out8.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0008 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0009（建立貓咪重新盤點，#109）：0001→0008 後先放一隻舊年齡層的貓，再跑 0009 兩次＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  try {
    await m.exec(base);
    await m.exec(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000009a1', 'f9@test.example');
      insert into public.meow_profiles (id, email) values ('00000000-0000-0000-0000-0000000009a1', 'f9@test.example');
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values ('00000000-0000-0000-0000-0000000009d0', '00000000-0000-0000-0000-0000000009a1', '舊資料', 'personal_foster', '桃園市', '龍潭區');
      insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values ('00000000-0000-0000-0000-0000000009f0', '00000000-0000-0000-0000-0000000009d0', '老資料', 'male', 'mature_adult', 'adoptable');`);
    await m.exec(read("../migrations/0009_meow_cat_returns.sql"));
    await m.exec(read("../migrations/0009_meow_cat_returns.sql"));
    const sql9 = read("./0009_meow_cat_returns.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out9 = await m.exec(sql9);
    results = results.concat(out9.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0009 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0010（領養申請通知）：0001→0009 後跑 0010 兩次＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0010_meow_adoption_notify.sql"));
    await m.exec(read("../migrations/0010_meow_adoption_notify.sql"));
    const sql10 = read("./0010_meow_adoption_notify.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out10 = await m.exec(sql10);
    results = results.concat(out10.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0010 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0011（領養管理與私訊，#128）：0001→0010 後先放舊的問卷回覆（待聯絡／進一步了解／婉拒），跑 0011 兩次，檢查轉換＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000011${n}`;
  try {
    await m.exec(base);
    await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'f@old.example'), ('${id("a1")}', 'p1@old.example'), ('${id("a2")}', 'p2@old.example'), ('${id("a3")}', 'p3@old.example');
      insert into public.meow_profiles (id, email) select id, email from auth.users where email like '%@old.example';
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values ('${id("d0")}', '${id("a0")}', '舊中途', 'personal_foster', '桃園市', '龍潭區');
      insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values ('${id("c0")}', '${id("d0")}', '舊貓', 'male', 'adult', 'adoptable');
      insert into public.meow_adoption_forms (id, cat_id, questions) values ('${id("f0")}', '${id("c0")}', '[{"id":"q1"}]');
      insert into public.meow_adoption_responses (form_id, respondent_id, respondent_name, status) values
        ('${id("f0")}', '${id("a1")}', '待聯絡的人', 'submitted'), ('${id("f0")}', '${id("a2")}', '進一步的人', 'submitted'), ('${id("f0")}', '${id("a3")}', '婉拒的人', 'submitted');
      update public.meow_adoption_responses set status = 'contact' where respondent_id = '${id("a1")}';
      update public.meow_adoption_responses set status = 'follow_up' where respondent_id = '${id("a2")}';
      update public.meow_adoption_responses set status = 'declined' where respondent_id = '${id("a3")}';`);
    await m.exec(read("../migrations/0011_meow_threads.sql"));
    await m.exec(read("../migrations/0011_meow_threads.sql"));
    const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
    const eq = (name, expected, actual) =>
      results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
    eq("THR-L1 舊的已送出問卷各開一串（重跑不重複）", 3, await one("select count(*) from public.meow_threads"));
    eq("THR-L2 每串一則「送出了領養問卷」（重跑不重複）", 3, await one("select count(*) from public.meow_messages where kind = 'system' and body like '%送出了領養問卷。'"));
    eq("THR-L3 待聯絡／進一步了解改回已送出", "declined,submitted,submitted", await one("select string_agg(status, ',' order by status) from public.meow_adoption_responses"));
    eq("THR-L4 婉拒轉成對話串的婉拒標記", "婉拒的人", await one("select string_agg(member_name, ',') from public.meow_threads where declined_at is not null"));
    eq("THR-L5 中途處理過的申請算已讀", 3, await one("select count(*) from public.meow_threads where keeper_read_at is not null"));
    const sql11 = read("./0011_meow_threads.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out11 = await m.exec(sql11);
    results = results.concat(out11.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0011 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0012（送養追蹤，#128）：0001→0011 後先放一隻已移轉的舊貓（有原中途、有一位其他申請人），跑 0012 兩次，檢查補資料＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000012${n}`;
  try {
    await m.exec(base);
    await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'f@old12.example'), ('${id("a1")}', 'adopter@old12.example'), ('${id("a2")}', 'other@old12.example');
      insert into public.meow_profiles (id, email, display_name) select id, email, split_part(email, '@', 1) from auth.users where email like '%@old12.example';
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values
        ('${id("d0")}', '${id("a0")}', '舊中途', 'personal_foster', '桃園市', '龍潭區'),
        ('${id("d1")}', '${id("a1")}', '領養人的家', 'cat_owner', '桃園市', '中壢區');
      insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values ('${id("c0")}', '${id("d0")}', '舊貓', 'male', 'adult', 'adoptable');
      insert into public.meow_threads (cat_id, member_id, household_id, cat_name, household_name, member_name) values ('${id("c0")}', '${id("a2")}', '${id("d0")}', '舊貓', '舊中途', 'other');
      select set_config('meow.cat_flow', 'on', false);
      update public.meow_cats set household_id = '${id("d1")}', status = 'own', origin_household_id = '${id("d0")}' where id = '${id("c0")}';`);
    await m.exec(read("../migrations/0012_meow_thread_homed.sql"));
    await m.exec(read("../migrations/0012_meow_thread_homed.sql"));
    const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
    const eq = (name, expected, actual) =>
      results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
    eq("HOM-L1 已移轉的舊貓：領養人補開一串、其他申請人也進送養追蹤（重跑不重複）", "adopter:true|other:false",
      await one("select string_agg(member_name || ':' || is_adopter, '|' order by member_name) from public.meow_threads where homed_at is not null"));
    eq("HOM-L2 補開的串只有一則系統事件（重跑不重複）", 1, await one("select count(*) from public.meow_messages m join public.meow_threads t on t.id = m.thread_id where t.is_adopter"));
    const sql12 = read("./0012_meow_thread_homed.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out12 = await m.exec(sql12);
    results = results.concat(out12.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0012 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0013（婉拒理由與移轉，#128 追加）：0001→0012 後跑 0013 兩次＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0013_meow_decline_reason_transfer.sql"));
    await m.exec(read("../migrations/0013_meow_decline_reason_transfer.sql"));
    const sql13 = read("./0013_meow_decline_reason_transfer.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out13 = await m.exec(sql13);
    results = results.concat(out13.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0013 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0014（影片轉 3D 房間，#93）：0001→0013 後跑 0014 兩次＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0014_meow_room_models.sql"));
    await m.exec(read("../migrations/0014_meow_room_models.sql"));
    const sql14 = read("./0014_meow_room_models.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out14 = await m.exec(sql14);
    results = results.concat(out14.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0014 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0014（退養接到領養管理，#128 追加）：0001→0013 後先放一筆處理中的退養請求（還沒接對話串），跑 0014 兩次，檢查補資料＋測試
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000014${n}`;
  try {
    await m.exec(base);
    await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'f@old14.example'), ('${id("a1")}', 'adopter@old14.example');
      insert into public.meow_profiles (id, email, display_name) select id, email, split_part(email, '@', 1) from auth.users where email like '%@old14.example';
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values
        ('${id("d0")}', '${id("a0")}', '舊中途', 'personal_foster', '桃園市', '龍潭區'),
        ('${id("d1")}', '${id("a1")}', '領養人的家', 'cat_owner', '桃園市', '中壢區');
      insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values ('${id("c0")}', '${id("d1")}', '舊貓', 'male', 'adult', 'own');
      update public.meow_cats set origin_household_id = '${id("d0")}' where id = '${id("c0")}';
      insert into public.meow_cat_returns (cat_id, cat_name, requester_id, from_household_id, from_household_name, origin_household_id, reason)
        values ('${id("c0")}', '舊貓', '${id("a1")}', '${id("d1")}', '領養人的家', '${id("d0")}', '舊的退養原因');`);
    await m.exec(read("../migrations/0014_meow_returns_in_threads.sql"));
    await m.exec(read("../migrations/0014_meow_returns_in_threads.sql"));
    const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
    const eq = (name, expected, actual) =>
      results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
    eq("RTN-L1 舊的退養請求接上領養人和原中途的對話串（送養追蹤、領養人）", "舊中途|true|true",
      await one("select t.household_name || '|' || (t.homed_at is not null) || '|' || t.is_adopter from public.meow_cat_returns r join public.meow_threads t on t.id = r.thread_id"));
    eq("RTN-L2 處理中的請求補上系統事件和原因（重跑不重複）", "system:提出了「舊貓」的退養請求。|text:舊的退養原因",
      await one("select string_agg(kind || ':' || body, '|' order by created_at) from public.meow_messages"));
    const sql14 = read("./0014_meow_returns_in_threads.test.sql").replace(/^\s*begin;/im, "").replace(/rollback;\s*$/i, "");
    const out14 = await m.exec(sql14);
    results = results.concat(out14.flatMap((r) => r.rows ?? []).filter((r) => "status" in r));
  } catch (e) {
    console.error(`✗ 0014 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0018（系統預設任務起始內容，#161）：0001→0017 後跑 0018 兩次，檢查三個年齡層各一套、內容通過任務檢查、中途選預設任務能存成版本
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000018${n}`;
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0018_meow_task_templates_seed.sql"));
    await m.exec(read("../migrations/0018_meow_task_templates_seed.sql"));
    const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
    const eq = (name, expected, actual) =>
      results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
    eq("TPL-1 三個年齡層各一套啟用中的預設任務（重跑不重複）", "adult,kitten,senior",
      await one("select string_agg(life_stage, ',' order by life_stage) from public.meow_task_templates where is_active"));
    eq("TPL-2 每套內容都通過任務檢查（劇情、2～6 個選項、回饋、好的選項）", "0",
      await one("select count(*) from public.meow_task_templates where public.meow_task_content_error(content) is not null"));
    await m.exec("update public.meow_task_templates set title = 'MeowHQ 改過的' where life_stage = 'adult'");
    await m.exec(read("../migrations/0018_meow_task_templates_seed.sql"));
    eq("TPL-3 已經有啟用中的預設任務就不蓋掉", "MeowHQ 改過的", await one("select title from public.meow_task_templates where life_stage = 'adult' and is_active"));
    await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'f@tpl18.example');
      insert into public.meow_profiles (id, email, display_name) values ('${id("a0")}', 'f@tpl18.example', 'f');
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values ('${id("d0")}', '${id("a0")}', '中途', 'personal_foster', '桃園市', '龍潭區');
      insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values ('${id("c0")}', '${id("d0")}', '小老', 'male', 'senior', 'preparing');`);
    await m.exec(`begin;
      select set_config('request.jwt.claim.sub', '${id("a0")}', true);
      set local role authenticated;
      select public.meow_save_cat_tasks('${id("c0")}', true);
      commit;`);
    eq("TPL-4 中途選「先用系統預設任務」：存成這隻貓年齡層的預設版本", "default|老貓的預設任務",
      await one(`select v.source || '|' || t.title from public.meow_cat_task_versions v join public.meow_task_templates t on t.id = v.template_id where v.cat_id = '${id("c0")}'`));
  } catch (e) {
    console.error(`✗ 0018 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0019（喵戶頭像）：0001→0018 後跑 0019 兩次，喵戶長能存自己喵戶的頭像路徑、不能存網址
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks", "0018_meow_task_templates_seed"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000019${n}`;
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0019_meow_household_avatar.sql"));
    await m.exec(read("../migrations/0019_meow_household_avatar.sql"));
    await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'h@av19.example');
      insert into public.meow_profiles (id, email, display_name) values ('${id("a0")}', 'h@av19.example', 'h');
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values ('${id("d0")}', '${id("a0")}', '黃家', 'cat_owner', '桃園市', '中壢區');`);
    const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
    const eq = (name, expected, actual) =>
      results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
    await m.exec(`begin;
      select set_config('request.jwt.claim.sub', '${id("a0")}', true);
      set local role authenticated;
      update public.meow_households set avatar_path = '${id("a0")}/households/a.jpg' where id = '${id("d0")}';
      commit;`);
    eq("AV-1 喵戶長能存自己喵戶的頭像路徑", `${id("a0")}/households/a.jpg`, await one(`select avatar_path from public.meow_households where id = '${id("d0")}'`));
    let blocked = "no";
    try { await m.exec(`update public.meow_households set avatar_path = 'https://evil.example/a.jpg' where id = '${id("d0")}'`); } catch { blocked = "yes"; }
    eq("AV-2 只存路徑，不能存網址", "yes", blocked);
  } catch (e) {
    console.error(`✗ 0019 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0020（貓戶管理模組，#179）：0001→0019 後跑 0020 兩次。現有管理員自動授權；有模組的管理員讀得到私密貓戶與貓咪；沒模組的讀不到
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks", "0018_meow_task_templates_seed", "0019_meow_household_avatar"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000020${n}`;
  const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
  const eq = (name, expected, actual) =>
    results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
  const as = async (who, sql) => {
    await m.exec(`begin; select set_config('request.jwt.claim.sub', '${id(who)}', true); set local role authenticated;`);
    try { return await one(sql); } finally { await m.exec("rollback;"); }
  };
  try {
    await m.exec(base);
    await m.exec(`insert into auth.users (id, email) values ('${id("a1")}', 'a1@h20.example'), ('${id("b1")}', 'ho@h20.example');
      insert into public.meow_profiles (id, email, display_name) values ('${id("a1")}', 'a1@h20.example', 'a1'), ('${id("b1")}', 'ho@h20.example', 'ho');
      update public.meow_profiles set role = 'admin' where id = '${id("a1")}';
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, default_visibility) values ('${id("d0")}', '${id("b1")}', '私密之家', 'cat_owner', '桃園市', '中壢區', 'private');`);
    eq("HH-0 0020 前：管理員沒有貓戶管理模組時讀不到私密貓戶", "0", await as("a1", "select count(*) from public.meow_households"));
    await m.exec(read("../migrations/0020_meow_households_module.sql"));
    await m.exec(read("../migrations/0020_meow_households_module.sql"));
    eq("HH-1 現有管理員自動取得貓戶管理模組", "1", await one(`select count(*) from public.meow_admin_module_grants where admin_id = '${id("a1")}' and module = 'households'`));
    eq("HH-2 有模組的管理員讀得到私密貓戶", "1", await as("a1", "select count(*) from public.meow_households"));
    eq("HH-3 有模組的管理員讀得到貓戶長資料", "1", await as("a1", `select count(*) from public.meow_profiles where id = '${id("b1")}'`));
    await m.exec(`delete from public.meow_admin_module_grants where admin_id = '${id("a1")}'`);
    eq("HH-4 撤銷模組後讀不到私密貓戶", "0", await as("a1", "select count(*) from public.meow_households"));
    eq("HH-5 households 可以授權", "true", await one("select pg_get_constraintdef(oid) like '%households%' from pg_constraint where conname = 'meow_admin_module_grants_module_check'"));
  } catch (e) {
    console.error(`✗ 0020 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0022（前台 3D 房間 storage 權限，#161）：0001→0020 後（0021 要 storage.extension，模擬環境沒有，也和這裡無關），0017 的規則擋住喵戶長；跑 0022 兩次後喵戶長能傳、別人不能傳
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks", "0018_meow_task_templates_seed", "0019_meow_household_avatar", "0020_meow_households_module"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000022${n}`;
  const eq = (name, expected, actual) =>
    results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
  // 用某人的身分新增一個 storage 物件，被 RLS 擋下回 false
  const can = async (who, bucket, path) => {
    await m.exec(`begin; select set_config('request.jwt.claim.sub', '${id(who)}', true); set local role authenticated;`);
    try { await m.exec(`insert into storage.objects (bucket_id, name) values ('${bucket}', '${path}')`); return true; }
    catch { return false; }
    finally { await m.exec("rollback;"); }
  };
  try {
    await m.exec(base);
    await m.exec(`insert into auth.users (id, email) values ('${id("a1")}', 'o1@h22.example'), ('${id("b1")}', 'x1@h22.example');
      insert into public.meow_profiles (id, email, display_name) values ('${id("a1")}', 'o1@h22.example', 'o1'), ('${id("b1")}', 'x1@h22.example', 'x1');
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values ('${id("d0")}', '${id("a1")}', '我家', 'cat_owner', '桃園市', '中壢區');`);
    const video = `${id("d0")}/a.mp4`;
    eq("HS-0 0022 前：0017 的規則擋住喵戶長上傳影片（name 對到喵戶名稱）", "false", await can("a1", "meow-home-videos", video));
    await m.exec(read("../migrations/0022_meow_home_storage_fix.sql"));
    await m.exec(read("../migrations/0022_meow_home_storage_fix.sql"));
    eq("HS-1 喵戶長能把影片傳到自己喵戶的資料夾", "true", await can("a1", "meow-home-videos", video));
    eq("HS-2 別人不能傳到這個喵戶的資料夾", "false", await can("b1", "meow-home-videos", video));
    await m.exec(`insert into storage.objects (bucket_id, name) values ('meow-home-scenes', '${id("d0")}/room_1/scene.json')`);
    const sees = async (who) => {
      await m.exec(`begin; select set_config('request.jwt.claim.sub', '${id(who)}', true); set local role authenticated;`);
      try { return (await m.query("select count(*)::int as n from storage.objects where bucket_id = 'meow-home-scenes'")).rows[0].n; }
      finally { await m.exec("rollback;"); }
    };
    eq("HS-3 喵戶長讀得到自己的 3D 房間成果", "1", await sees("a1"));
    eq("HS-4 別人讀不到", "0", await sees("b1"));
  } catch (e) {
    console.error(`✗ 0022 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0024（中途建貓資料的新流程，#206）：0001→0020 後先放一隻有舊標籤的貓，跑 0024 兩次，檢查舊資料轉換、新欄位與限制
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks", "0018_meow_task_templates_seed", "0019_meow_household_avatar", "0020_meow_households_module"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000024${n}`;
  const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
  const eq = (name, expected, actual) =>
    results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
  const fails = async (sql) => { try { await m.exec(sql); return "ok"; } catch { return "rejected"; } };
  try {
    await m.exec(base);
    await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'f@c24.example');
      insert into public.meow_profiles (id, email, display_name) values ('${id("a0")}', 'f@c24.example', 'f');
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values ('${id("d0")}', '${id("a0")}', '中途', 'personal_foster', '桃園市', '龍潭區');
      insert into public.meow_cats (id, household_id, name, sex, life_stage, status, health_tags, personality_tags, habits, medical, compat) values
        ('${id("c0")}', '${id("d0")}', '舊貓', 'male', 'adult', 'adoptable',
         array['已結紮', '疫苗已完成', 'FIV 陽性', '需每日用藥', '特殊飲食'], array['安靜', '親其他貓', '親人'], array['護食', '夜間活躍', '會用貓砂'],
         '{"neutered": "unknown", "history": "曾經感冒"}', '{"cats": "unknown", "dogs": "no", "kids": "unknown"}'),
        ('${id("c1")}', '${id("d0")}', '新貓', 'unknown', 'kitten', 'adoptable', '{}', array['親人'], '{}', '{}', '{}');`);
    await m.exec(read("../migrations/0024_meow_cat_new_flow.sql"));
    await m.exec(read("../migrations/0024_meow_cat_new_flow.sql"));
    const c0 = (col) => one(`select ${col} from public.meow_cats where id = '${id("c0")}'`);
    eq("CAT24-1 舊健康標籤移到醫療細項；需每日用藥改名每天吃藥", "每天吃藥", await c0("array_to_string(health_tags, ',')"));
    eq("CAT24-2 結紮、疫苗、FIV 寫進醫療細項，特殊飲食併進病史", "done|3|fiv_positive|曾經感冒；特殊飲食",
      await c0("concat_ws('|', medical ->> 'neutered', medical ->> 'vaccineDoses', medical ->> 'fivFelv', medical ->> 'history')"));
    eq("CAT24-3 個性：安靜改成慵懶，親其他貓改成跟其他貓處得來（不蓋掉已經填的）", "慵懶,親人|yes|no",
      await c0("concat_ws('|', (select string_agg(t, ',' order by t) from unnest(personality_tags) t), compat ->> 'cats', compat ->> 'dogs')"));
    eq("CAT24-4 生活習慣：護食移到小小壞習慣，夜間活躍改名半夜跑酷", "半夜跑酷,會用貓砂|sometimes",
      await c0("concat_ws('|', (select string_agg(t, ',' order by t) from unnest(habits) t), behavior -> 'guard' ->> 'level')"));
    eq("CAT24-5 沒有舊標籤的貓不動", "親人|{}", await one(`select array_to_string(personality_tags, ',') || '|' || behavior::text from public.meow_cats where id = '${id("c1")}'`));
    eq("CAT24-6 新欄位可以存設計稿的資料", "ok", await fails(`update public.meow_cats set personality_scale = '{"energy": 1, "bond": 5, "brave": null, "adapt": 3}',
      photo_angles = '{"front": "u/f.jpg", "left": "u/l.jpg", "back": null}', cover = 'o:2', intro = '吃飽睡、睡飽吃', ai_story = '{"tags": ["心臟病"], "text": null}',
      care = '{"handling": {"nail": "tricky"}, "weightKg": 4.2}', compat = '{"cats": "maybe", "dogs": "unknown", "kids": "unknown", "guest": "no", "notes": {"cats": "要隔離一週"}}'
      where id = '${id("c1")}'`));
    eq("CAT24-7 個性量表超出 1–5 會被擋", "rejected", await fails(`update public.meow_cats set personality_scale = '{"energy": 6}' where id = '${id("c1")}'`));
    eq("CAT24-8 封面格式不對會被擋", "rejected", await fails(`update public.meow_cats set cover = 'https://x/a.jpg' where id = '${id("c1")}'`));
    eq("CAT24-9 生活照最多 6 張", "ok|rejected", [
      await fails(`update public.meow_cats set photo_paths = array['1', '2', '3', '4', '5', '6'] where id = '${id("c1")}'`),
      await fails(`update public.meow_cats set photo_paths = array['1', '2', '3', '4', '5', '6', '7'] where id = '${id("c1")}'`),
    ].join("|"));
  } catch (e) {
    console.error(`✗ 0024 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0025（一般飼主的每月預算，#233）：只有喵戶長本人讀寫得到；中途的喵戶不能存；別人和未登入都讀不到
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks", "0018_meow_task_templates_seed", "0019_meow_household_avatar", "0020_meow_households_module"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000025${n}`;
  const eq = (name, expected, actual) =>
    results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
  // 用某人的身分（null＝未登入）執行，被擋下回 "rejected"
  const as = async (who, sql) => {
    await m.exec(who ? `begin; select set_config('request.jwt.claim.sub', '${id(who)}', true); set local role authenticated;` : "begin; set local role anon;");
    try { const r = await m.query(sql); return r.rows.length ? Object.values(r.rows[0])[0] : "ok"; }
    catch { return "rejected"; }
    finally { await m.exec("rollback;"); }
  };
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0025_meow_household_budget.sql"));
    await m.exec(read("../migrations/0025_meow_household_budget.sql"));
    await m.exec(`insert into auth.users (id, email) values ('${id("a1")}', 'o@b25.example'), ('${id("b1")}', 'x@b25.example');
      insert into public.meow_profiles (id, email, display_name) values ('${id("a1")}', 'o@b25.example', 'o'), ('${id("b1")}', 'x@b25.example', 'x');
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values
        ('${id("d0")}', '${id("a1")}', '我家', 'cat_owner', '桃園市', '中壢區'),
        ('${id("d1")}', '${id("a1")}', '我的中途', 'personal_foster', '桃園市', '中壢區');
      insert into public.meow_household_budgets (household_id, monthly_twd) values ('${id("d0")}', 4000);`);
    const q = `select monthly_twd from public.meow_household_budgets where household_id = '${id("d0")}'`;
    eq("BG-1 喵戶長讀得到自己的每月預算", "4000", await as("a1", q));
    eq("BG-2 別人讀不到", "ok", await as("b1", q));
    eq("BG-3 未登入讀不到", "rejected", await as(null, q));
    eq("BG-4 喵戶長可以改預算", "ok", await as("a1", `update public.meow_household_budgets set monthly_twd = 5000 where household_id = '${id("d0")}'`));
    eq("BG-5 別人不能幫他新增預算", "rejected", await as("b1", `insert into public.meow_household_budgets (household_id, monthly_twd) values ('${id("d1")}', 1)`));
    eq("BG-6 中途的喵戶不能存預算", "rejected", await as("a1", `insert into public.meow_household_budgets (household_id, monthly_twd) values ('${id("d1")}', 3000)`));
    eq("BG-7 預算超出 1～200,000 會被擋", "rejected", await as("a1", `update public.meow_household_budgets set monthly_twd = 0 where household_id = '${id("d0")}'`));
  } catch (e) {
    console.error(`✗ 0025 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0026（任務證明改名試養報告，#233）：0001→0017 後跑 0026 兩次，系統訊息換成新名稱，執行權限不變
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
  const eq = (name, expected, actual) =>
    results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0026_meow_trial_report_rename.sql"));
    await m.exec(read("../migrations/0026_meow_trial_report_rename.sql"));
    const src = "(select prosrc from pg_proc where proname = 'meow_share_task_proof')";
    eq("TR-1 系統訊息改成「附上了試養報告。」，舊名稱不再出現", "t|f",
      await one(`select concat_ws('|', position('附上了試養報告。' in ${src}) > 0, position('任務證明' in ${src}) > 0)`));
    eq("TR-2 已登入可以執行、未登入不行", "t|f",
      await one(`select concat_ws('|', has_function_privilege('authenticated', 'public.meow_share_task_proof(uuid)', 'execute'), has_function_privilege('anon', 'public.meow_share_task_proof(uuid)', 'execute'))`));
  } catch (e) {
    console.error(`✗ 0026 測試中斷：${e.message}`);
    process.exit(1);
  }
}

// 0030（領養任務改成領養人按下才產生）：0001→0018 後跑 0030 兩次。
// 中途只確認 3D 模型就能出發；領養人準備任務會用年齡層預設任務存一版、重按回傳同一版；準備中的貓、未登入都不行
{
  const m = new PGlite();
  const base = read("./stub_supabase.sql") + ["0001_meow", "0002_meow_hq", "0003_meow_site_assets", "0004_meow_cat_profile", "0005_meow_cat_models", "0006_meow_household_roles", "0007_meow_adoption_forms", "0008_meow_cat_favorites", "0009_meow_cat_returns", "0010_meow_adoption_notify", "0011_meow_threads", "0012_meow_thread_homed", "0013_meow_decline_reason_transfer", "0014_meow_room_models", "0014_meow_returns_in_threads", "0015_meow_room_floorplan", "0016_meow_cat_model_variants", "0017_meow_adoption_tasks", "0018_meow_task_templates_seed"]
    .map((f) => read(`../migrations/${f}.sql`)).join("");
  const id = (n) => `00000000-0000-0000-0000-0000000030${n}`;
  const one = async (sql) => Object.values((await m.query(sql)).rows[0] ?? {})[0];
  const eq = (name, expected, actual) =>
    results.push({ name, status: String(actual) === String(expected) ? "PASS" : "FAIL", detail: String(actual) === String(expected) ? null : `預期 ${expected}，實際 ${actual}` });
  // 用某人的身分執行；失敗時回傳錯誤代碼
  const as = async (who, sql) => {
    try {
      const r = await m.query(`select set_config('request.jwt.claim.sub', '${who}', false)`).then(() => m.exec(`set role authenticated; ${sql}; reset role;`));
      return r;
    } catch (e) { await m.exec("reset role;").catch(() => {}); return e.message; }
  };
  try {
    await m.exec(base);
    await m.exec(read("../migrations/0030_meow_tasks_on_demand.sql"));
    await m.exec(read("../migrations/0030_meow_tasks_on_demand.sql"));
    await m.exec(`insert into auth.users (id, email) values ('${id("a0")}', 'f@t30.example'), ('${id("a1")}', 'm@t30.example');
      insert into public.meow_profiles (id, email, display_name) values ('${id("a0")}', 'f@t30.example', 'f'), ('${id("a1")}', 'm@t30.example', 'm');
      insert into public.meow_households (id, owner_id, name, caretaker_type, city, district) values ('${id("d0")}', '${id("a0")}', '中途', 'personal_foster', '桃園市', '龍潭區');
      insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values
        ('${id("c0")}', '${id("d0")}', '妹妹', 'female', 'senior', 'preparing'),
        ('${id("c1")}', '${id("d0")}', '準備中', 'male', 'adult', 'preparing');
      insert into public.meow_cat_models (id, name, owner_type, owner_id, status, photo_path, cat_id) values ('cat_20261106_000000', '妹妹', 'member', '${id("a0")}', 'ready', '', '${id("c0")}');
      insert into public.meow_cat_model_variants (model_id, body_type, albedo_path, confirmed_albedo) values ('cat_20261106_000000', 'adult', 'default', 'default');`);
    await as(id("a0"), `select public.meow_publish_cat('${id("c0")}')`);
    eq("TOD-1 中途沒出任務、3D 模型已確認就能出發", "adoptable", await one(`select status from public.meow_cats where id = '${id("c0")}'`));
    eq("TOD-2 出發時不會自動建任務（等領養人按下才產生）", "0", await one(`select count(*) from public.meow_cat_task_versions where cat_id = '${id("c0")}'`));
    await as(id("a1"), `select public.meow_prepare_cat_tasks('${id("c0")}')`);
    await as(id("a1"), `select public.meow_prepare_cat_tasks('${id("c0")}')`);
    eq("TOD-4 領養人按下：用老貓預設任務存一版，重按不會再多一版", "1|default|老貓的預設任務",
      await one(`select count(*) || '|' || min(v.source) || '|' || min(t.title) from public.meow_cat_task_versions v join public.meow_task_templates t on t.id = v.template_id where v.cat_id = '${id("c0")}'`));
    eq("TOD-5 任務組的目前版本指向這一版", "true",
      await one(`select s.current_version_id = v.id from public.meow_cat_task_sets s join public.meow_cat_task_versions v on v.cat_id = s.cat_id where s.cat_id = '${id("c0")}'`));
    eq("TOD-6 準備中的貓不能準備任務", "run_cat_not_ready", String(await as(id("a1"), `select public.meow_prepare_cat_tasks('${id("c1")}')`)).match(/run_cat_not_ready/)?.[0]);
    eq("TOD-7 準備中的貓 3D 沒確認還是不能出發", "cat_model_not_confirmed", String(await as(id("a0"), `select public.meow_publish_cat('${id("c1")}')`)).match(/cat_model_not_confirmed/)?.[0]);
    eq("TOD-8 已登入可以執行、未登入不行", "t|f",
      await one(`select concat_ws('|', has_function_privilege('authenticated', 'public.meow_prepare_cat_tasks(uuid)', 'execute'), has_function_privilege('anon', 'public.meow_prepare_cat_tasks(uuid)', 'execute'))`));
  } catch (e) {
    console.error(`✗ 0030 測試中斷：${e.message}`);
    process.exit(1);
  }
}

let failed = 0;
for (const r of results) {
  if (r.status === "FAIL") failed++;
  console.log(`${r.status}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\nPASS ${count("PASS")}｜FAIL ${failed}｜SKIP ${count("SKIP")}`);
process.exit(failed || results.length === 0 ? 1 : 0);
