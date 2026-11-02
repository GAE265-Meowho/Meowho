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

let failed = 0;
for (const r of results) {
  if (r.status === "FAIL") failed++;
  console.log(`${r.status}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\nPASS ${count("PASS")}｜FAIL ${failed}｜SKIP ${count("SKIP")}`);
process.exit(failed || results.length === 0 ? 1 : 0);
