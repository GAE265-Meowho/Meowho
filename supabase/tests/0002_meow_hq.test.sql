-- MeowHQ 資料庫測試（UT-HQDB-01～13、UT-HQ-39～40），對應 docs/hq/02 §4.4、§4.6、§4.8。
-- 執行方式（擇一）：
--   1. 本機臨時資料庫：node supabase/tests/run-pglite.mjs（建議，完全不連 Supabase）
--   2. 本機 Supabase（supabase start）的資料庫：psql 執行本檔；最後一個 select 會列出每個案例的結果。
-- ⚠ 本檔會寫入 auth.users 與 meow_* 測試資料（結束時 rollback），**不要在共用的正式 Supabase 專案執行**。
-- 固定角色（docs/hq/02 §3）：SA1、SA2 系統管理員；ADU 管理員（用戶權限管理）；ADP 管理員（商品、知識管理）；
--   ADR 管理員（檢舉與內容審核）；CF 貓友；HO 貓戶長；X 一般登入者。
-- 測試用的輔助函式都建在 pg_temp，不會留下任何非 meow_ 開頭的物件。

begin;

create temp table fx (code text primary key, id uuid not null, email text not null);
create temp table test_results (n serial, name text, status text, detail text);

create function pg_temp.u(p_code text) returns uuid language sql stable as $fn$
  select id from pg_temp.fx where code = p_code
$fn$;

create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $fn$
  insert into pg_temp.test_results (name, status, detail)
  values (p_name, case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end, case when coalesce(p_ok, false) then null else p_detail end)
$fn$;

create function pg_temp.skip(p_name text, p_why text) returns void language sql as $fn$
  insert into pg_temp.test_results (name, status, detail) values (p_name, 'SKIP', p_why)
$fn$;

-- 以某個固定角色的身分執行一段 SQL（p_code 為 null＝未登入），回傳第一欄的文字；失敗時回傳 'ERROR: ...'
create function pg_temp.run_as(p_code text, p_sql text, p_role text default 'authenticated') returns text language plpgsql as $fn$
declare v text; uid uuid; em text;
begin
  if p_code is not null then
    uid := pg_temp.u(p_code);
    select email into em from pg_temp.fx where code = p_code;
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'email', em)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    return 'ERROR: ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return coalesce(v, '');
end $fn$;

-- 以目前身分（postgres）直接執行，回傳 'ERROR: ...' 或 ''
create function pg_temp.try_sql(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return '';
exception when others then
  return 'ERROR: ' || sqlerrm;
end $fn$;

create function pg_temp.expect_err(p_name text, p_code text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual like 'ERROR:%' || p_code || '%', p_actual)
$fn$;

create function pg_temp.expect_ok(p_name text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual not like 'ERROR:%', p_actual)
$fn$;

create function pg_temp.expect_eq(p_name text, p_expected text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual is not distinct from p_expected, '預期 ' || coalesce(p_expected, 'null') || '，實際 ' || coalesce(p_actual, 'null'))
$fn$;

-- 執行一個會寫稽核日誌的操作：必須成功、剛好新增 1 筆、action／操作者／原因／對象都正確（UT-HQDB-06）
create function pg_temp.op_logged(p_name text, p_code text, p_sql text, p_action text) returns void language plpgsql as $fn$
declare n0 bigint; r text; last_row record;
begin
  select count(*) into n0 from public.meow_audit_logs;
  r := pg_temp.run_as(p_code, p_sql);
  if r like 'ERROR:%' then perform pg_temp.check(p_name, false, r); return; end if;
  select * into last_row from public.meow_audit_logs order by id desc limit 1;
  perform pg_temp.check(p_name,
    (select count(*) from public.meow_audit_logs) = n0 + 1
      and last_row.action = p_action
      and last_row.actor_id = pg_temp.u(p_code)
      and length(trim(coalesce(last_row.reason, ''))) > 0
      and last_row.target_id is not null,
    format('action=%s actor=%s reason=%s target=%s 新增筆數=%s', last_row.action, last_row.actor_id, last_row.reason, last_row.target_id,
           (select count(*) from public.meow_audit_logs) - n0));
end $fn$;

-- 通知對象（代號清單，排序後以逗號連接）
create function pg_temp.notified(p_type text) returns text language sql as $fn$
  select coalesce(string_agg(f.code, ',' order by f.code), '')
    from public.meow_notifications n join pg_temp.fx f on f.id = n.user_id where n.type = p_type
$fn$;

-- ---------------------------------------------------------------- 測試資料
insert into pg_temp.fx values
  ('SA1',  '00000000-0000-0000-0000-0000000000a1', 'sa1@test.example'),
  ('SA2',  '00000000-0000-0000-0000-0000000000a2', 'sa2@test.example'),
  ('ADU',  '00000000-0000-0000-0000-0000000000b1', 'adu@test.example'),
  ('ADP',  '00000000-0000-0000-0000-0000000000b2', 'adp@test.example'),
  ('ADR',  '00000000-0000-0000-0000-0000000000b3', 'adr@test.example'),
  ('CF',   '00000000-0000-0000-0000-0000000000c1', 'cf@test.example'),
  ('HO',   '00000000-0000-0000-0000-0000000000c2', 'ho@test.example'),
  ('X',    '00000000-0000-0000-0000-0000000000d1', 'x@test.example'),
  ('NEWB', '00000000-0000-0000-0000-0000000000e1', 'banned@example.com');

insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email, role)
  select id, email, case when code in ('SA1', 'SA2') then 'system_admin' when code in ('ADU', 'ADP', 'ADR') then 'admin' else 'member' end
    from pg_temp.fx where code <> 'NEWB';
insert into public.meow_admin_module_grants (admin_id, module, granted_by) values
  (pg_temp.u('ADU'), 'user_management', pg_temp.u('SA1')),
  (pg_temp.u('ADP'), 'products', pg_temp.u('SA1')),
  (pg_temp.u('ADP'), 'knowledge', pg_temp.u('SA1')),
  (pg_temp.u('ADR'), 'report_moderation', pg_temp.u('SA1'));
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district)
  values ('00000000-0000-0000-0000-0000000000f1', pg_temp.u('HO'), '小花之家', 'personal_foster', '台中市', '西區');

-- ---------------------------------------------------------------- 收緊 anon、匿名仍可讀公開資料
select pg_temp.check('anon 不能執行 meow_set_admin',
  not has_function_privilege('anon', 'public.meow_set_admin(text,boolean)', 'execute'));
select pg_temp.check('anon 不能執行 meow_is_admin',
  not has_function_privilege('anon', 'public.meow_is_admin()', 'execute'));
select pg_temp.check('anon 不能執行 meow_review_verification',
  not has_function_privilege('anon', 'public.meow_review_verification(uuid,boolean,text)', 'execute'));
select pg_temp.check('anon 不能執行 meow_notify_admins_verification',
  not has_function_privilege('anon', 'public.meow_notify_admins_verification()', 'execute'));
select pg_temp.check('登入者不能直接呼叫內部函式 meow_notify_module',
  not has_function_privilege('authenticated', 'public.meow_notify_module(text,text,text,text,text)', 'execute'));
select pg_temp.expect_ok('未登入仍可讀公開貓戶（RLS 不呼叫被收回的函式）',
  pg_temp.run_as(null, 'select count(*)::text from public.meow_households', 'anon'));
select pg_temp.expect_ok('未登入仍可讀網站設定',
  pg_temp.run_as(null, 'select count(*)::text from public.meow_site_settings', 'anon'));
select pg_temp.expect_eq('未登入看不到後台資料表', '0',
  pg_temp.run_as(null, 'select count(*)::text from public.meow_profiles', 'anon'));

-- ---------------------------------------------------------------- UT-HQ-39：新中途認證申請 → 通知對象
select pg_temp.expect_ok('HO 送出中途認證申請',
  pg_temp.run_as('HO', format($q$with i as (insert into public.meow_shelter_verifications (household_id, applicant_id, org_type, description)
      values (%L, %L, 'personal_foster', '在台中做個人中途三年，照顧六隻貓') returning 1) select count(*)::text from i$q$,
      '00000000-0000-0000-0000-0000000000f1', pg_temp.u('HO'))));
select pg_temp.expect_eq('UT-HQ-39 新的中途認證申請通知 ADU、SA1、SA2，不含 ADP', 'ADU,SA1,SA2', pg_temp.notified('verification_request'));

-- ---------------------------------------------------------------- UT-HQ-40：新的檢舉 → 通知對象
select public.meow_notify_module('report_moderation', 'report', '新的檢舉', null, '/MeowHQ/reports');
select pg_temp.expect_eq('UT-HQ-40 新的檢舉通知有「檢舉與內容審核」者（ADR）＋全部系統管理員', 'ADR,SA1,SA2', pg_temp.notified('report'));

-- ---------------------------------------------------------------- 模組權限判斷
select pg_temp.expect_eq('SA1 對任何模組都有權限（含 Admin 授權）', 'true', pg_temp.run_as('SA1', $q$select public.meow_has_module('admin_authorization')::text$q$));
select pg_temp.expect_eq('ADU 有用戶權限管理', 'true', pg_temp.run_as('ADU', $q$select public.meow_has_module('user_management')::text$q$));
select pg_temp.expect_eq('ADU 沒有商品', 'false', pg_temp.run_as('ADU', $q$select public.meow_has_module('products')::text$q$));
select pg_temp.expect_eq('管理員永遠沒有 Admin 授權', 'false', pg_temp.run_as('ADU', $q$select public.meow_has_module('admin_authorization')::text$q$));
select pg_temp.expect_eq('一般登入者 X 沒有任何模組', 'false', pg_temp.run_as('X', $q$select public.meow_has_module('user_management')::text$q$));

-- ---------------------------------------------------------------- UT-HQDB-01、02、05：停權的權限與原因
select pg_temp.expect_err('UT-HQDB-01 ADP（無用戶權限管理）呼叫停權函式 → 拒絕', 'permission_denied',
  pg_temp.run_as('ADP', format($q$select public.meow_suspend_user(%L, '詐騙', null)::text$q$, pg_temp.u('CF'))));
select pg_temp.expect_err('UT-HQDB-02 ADU 停權 ADP（管理員）→ 拒絕，需系統管理員', 'need_system_admin',
  pg_temp.run_as('ADU', format($q$select public.meow_suspend_user(%L, '職務異動', null)::text$q$, pg_temp.u('ADP'))));
select pg_temp.expect_err('停權期限不可是過去的時間', 'invalid_until',
  pg_temp.run_as('ADU', format($q$select public.meow_suspend_user(%L, '詐騙', now() - interval '1 day')::text$q$, pg_temp.u('CF'))));
select pg_temp.expect_err('UT-HQDB-05 停權原因為空字串 → 拒絕', 'reason_required',
  pg_temp.run_as('ADU', format($q$select public.meow_suspend_user(%L, '', null)::text$q$, pg_temp.u('CF'))));
select pg_temp.expect_err('UT-HQDB-05 停權原因只有空白 → 拒絕', 'reason_required',
  pg_temp.run_as('ADU', format($q$select public.meow_suspend_user(%L, '   ', null)::text$q$, pg_temp.u('CF'))));
select pg_temp.expect_err('UT-HQDB-05 停權原因為 null → 拒絕', 'reason_required',
  pg_temp.run_as('ADU', format($q$select public.meow_suspend_user(%L, null, null)::text$q$, pg_temp.u('CF'))));
select pg_temp.expect_err('UT-HQDB-05 解除停權未帶原因 → 拒絕', 'reason_required',
  pg_temp.run_as('ADU', format($q$select public.meow_unsuspend_user(%L, ' ')::text$q$, pg_temp.u('CF'))));
select pg_temp.expect_err('UT-HQDB-05 撤銷模組授權未帶原因 → 拒絕', 'reason_required',
  pg_temp.run_as('SA1', format($q$select public.meow_revoke_module(%L, 'products', '')::text$q$, pg_temp.u('ADP'))));
select pg_temp.expect_err('UT-HQDB-05 授予模組未帶原因 → 拒絕', 'reason_required',
  pg_temp.run_as('SA1', format($q$select public.meow_grant_module(%L, 'products', '')::text$q$, pg_temp.u('ADP'))));
select pg_temp.expect_err('UT-HQDB-05 變更角色未帶原因 → 拒絕', 'reason_required',
  pg_temp.run_as('SA1', format($q$select public.meow_set_role(%L, 'admin', '')::text$q$, 'x@test.example')));
select pg_temp.expect_err('UT-HQDB-05 加入黑名單未帶原因 → 拒絕', 'reason_required',
  pg_temp.run_as('SA1', $q$select public.meow_ban_email('spam@example.com', '')::text$q$));
select pg_temp.expect_err('UT-HQDB-05 撤銷中途徽章未帶原因 → 拒絕', 'reason_required',
  pg_temp.run_as('ADU', $q$select public.meow_revoke_badge('00000000-0000-0000-0000-0000000000f1', '')::text$q$));

-- ADU 可停權貓友與一般貓戶長（UT-HQ-05 對應的資料庫面），並寫稽核日誌
select pg_temp.op_logged('UT-HQDB-06 停權（ADU→X）寫入稽核日誌 1 筆', 'ADU',
  format($q$select public.meow_suspend_user(%L, '疑似販售貓咪', null)::text$q$, pg_temp.u('X')), 'suspend');
select pg_temp.expect_err('已停權的帳號不能重複停權', 'already_suspended',
  pg_temp.run_as('ADU', format($q$select public.meow_suspend_user(%L, '詐騙', null)::text$q$, pg_temp.u('X'))));
select pg_temp.op_logged('UT-HQDB-06 解除停權（ADU→X）寫入稽核日誌 1 筆', 'ADU',
  format($q$select public.meow_unsuspend_user(%L, '誤判')::text$q$, pg_temp.u('X')), 'unsuspend');

-- ---------------------------------------------------------------- UT-HQDB-03、04：停權管理員、系統管理員
select pg_temp.expect_err('UT-HQDB-04 SA1 停權 SA2 → 拒絕', 'target_is_system_admin',
  pg_temp.run_as('SA1', format($q$select public.meow_suspend_user(%L, '職務異動', null)::text$q$, pg_temp.u('SA2'))));
select pg_temp.expect_err('UT-HQDB-04 ADU 停權 SA2 → 拒絕', 'target_is_system_admin',
  pg_temp.run_as('ADU', format($q$select public.meow_suspend_user(%L, '職務異動', null)::text$q$, pg_temp.u('SA2'))));
select pg_temp.op_logged('UT-HQDB-03 SA1 停權 ADP → 成功並寫稽核日誌', 'SA1',
  format($q$select public.meow_suspend_user(%L, '職務異動', null)::text$q$, pg_temp.u('ADP')), 'suspend');
select pg_temp.expect_eq('UT-HQDB-03 ADP 的模組授權全部清空', '0',
  (select count(*)::text from public.meow_admin_module_grants where admin_id = pg_temp.u('ADP')));
select pg_temp.expect_eq('被停權的管理員沒有任何模組權限', 'false', pg_temp.run_as('ADP', $q$select public.meow_has_module('products')::text$q$));
select pg_temp.op_logged('UT-HQDB-06 解除停權（SA1→ADP）寫入稽核日誌 1 筆', 'SA1',
  format($q$select public.meow_unsuspend_user(%L, '誤判')::text$q$, pg_temp.u('ADP')), 'unsuspend');
select pg_temp.expect_eq('解除停權不會自動恢復模組授權', '0',
  (select count(*)::text from public.meow_admin_module_grants where admin_id = pg_temp.u('ADP')));

-- ---------------------------------------------------------------- 授權與角色變更
select pg_temp.op_logged('UT-HQDB-06 授予模組（SA1→ADP 商品）寫入稽核日誌 1 筆', 'SA1',
  format($q$select public.meow_grant_module(%L, 'products', '負責商品資料')::text$q$, pg_temp.u('ADP')), 'grant_module');
select pg_temp.expect_err('UT-HQ-11 對應：不可授予 Admin 授權模組', 'module_not_grantable',
  pg_temp.run_as('SA1', format($q$select public.meow_grant_module(%L, 'admin_authorization', '測試')::text$q$, pg_temp.u('ADP'))));
select pg_temp.expect_err('管理員不能授權他人', 'need_system_admin',
  pg_temp.run_as('ADU', format($q$select public.meow_grant_module(%L, 'knowledge', '測試')::text$q$, pg_temp.u('ADP'))));
select pg_temp.expect_err('只能授權給管理員，不能授權給一般會員', 'target_not_admin',
  pg_temp.run_as('SA1', format($q$select public.meow_grant_module(%L, 'knowledge', '測試')::text$q$, pg_temp.u('X'))));
select pg_temp.op_logged('UT-HQDB-06 撤銷模組授權（SA1→ADP 商品）寫入稽核日誌 1 筆', 'SA1',
  format($q$select public.meow_revoke_module(%L, 'products', '職務異動')::text$q$, pg_temp.u('ADP')), 'revoke_grant');
select pg_temp.op_logged('UT-HQDB-06 變更角色（X→管理員）寫入稽核日誌 1 筆', 'SA1',
  format($q$select public.meow_set_role(%L, 'admin', '新進管理員')::text$q$, 'x@test.example'), 'set_role');
select pg_temp.op_logged('UT-HQDB-06 變更角色（X→一般會員）寫入稽核日誌 1 筆', 'SA1',
  format($q$select public.meow_set_role(%L, 'member', '職務異動')::text$q$, 'x@test.example'), 'set_role');
select pg_temp.expect_err('管理員不能變更角色', 'need_system_admin',
  pg_temp.run_as('ADU', format($q$select public.meow_set_role(%L, 'admin', '測試')::text$q$, 'x@test.example')));
select pg_temp.expect_eq('變更角色時被修改者的 Email 不會被覆寫成操作者的', 'x@test.example',
  (select email from public.meow_profiles where id = pg_temp.u('X')));
select pg_temp.expect_eq('舊介面 meow_set_admin 仍可用（SA1 授權 X 為管理員）', 'ok',
  pg_temp.run_as('SA1', $q$select public.meow_set_admin('x@test.example', true)$q$));
select pg_temp.expect_eq('舊介面 meow_set_admin 找不到對象時回 not_found', 'not_found',
  pg_temp.run_as('SA1', $q$select public.meow_set_admin('nobody@test.example', true)$q$));
select pg_temp.expect_err('舊介面 meow_set_admin：管理員不能呼叫', 'need_system_admin',
  pg_temp.run_as('ADU', $q$select public.meow_set_admin('x@test.example', false)$q$));
select pg_temp.expect_eq('舊介面 meow_set_admin 移除管理員回 ok', 'ok',
  pg_temp.run_as('SA1', $q$select public.meow_set_admin('x@test.example', false)$q$));
select pg_temp.expect_err('登入者不能直接把自己的 role 改成管理員', 'role_change',
  pg_temp.run_as('X', format($q$with u as (update public.meow_profiles set role = 'system_admin' where id = %L returning 1) select count(*)::text from u$q$, pg_temp.u('X'))));

-- ---------------------------------------------------------------- 中途認證審核與徽章
select pg_temp.expect_err('ADP（無用戶權限管理）不能審核中途認證', 'permission_denied',
  pg_temp.run_as('ADP', format($q$select public.meow_review_verification(%L, true, '通過')::text$q$,
    (select id from public.meow_shelter_verifications where household_id = '00000000-0000-0000-0000-0000000000f1' and status = 'pending'))));
select pg_temp.op_logged('UT-HQDB-06 授予中途徽章（ADU 核准）寫入稽核日誌 1 筆', 'ADU',
  format($q$select public.meow_review_verification(%L, true, '資料齊全')::text$q$,
    (select id from public.meow_shelter_verifications where household_id = '00000000-0000-0000-0000-0000000000f1' and status = 'pending')), 'grant_badge');
select pg_temp.expect_eq('核准後貓戶取得徽章', 'true',
  (select verified_shelter::text from public.meow_households where id = '00000000-0000-0000-0000-0000000000f1'));
select pg_temp.op_logged('UT-HQDB-06 撤銷中途徽章寫入稽核日誌 1 筆', 'ADU',
  $q$select public.meow_revoke_badge('00000000-0000-0000-0000-0000000000f1', '資料不符')::text$q$, 'revoke_badge');
select pg_temp.expect_eq('撤銷後貓戶失去徽章', 'false',
  (select verified_shelter::text from public.meow_households where id = '00000000-0000-0000-0000-0000000000f1'));
select pg_temp.expect_err('ADP 不能撤銷徽章', 'permission_denied',
  pg_temp.run_as('ADP', $q$select public.meow_revoke_badge('00000000-0000-0000-0000-0000000000f1', '資料不符')::text$q$));

-- ---------------------------------------------------------------- UT-HQDB-11：黑名單
select pg_temp.expect_err('黑名單：管理員不能操作', 'need_system_admin',
  pg_temp.run_as('ADU', $q$select public.meow_ban_email('banned@example.com', '詐騙')::text$q$));
select pg_temp.expect_err('黑名單：不能加入系統管理員的帳號', 'target_is_system_admin',
  pg_temp.run_as('SA1', format($q$select public.meow_ban_email(%L, '詐騙')::text$q$, 'sa2@test.example')));
select pg_temp.op_logged('UT-HQDB-06 加入黑名單（Email 不分大小寫、去空白）寫入稽核日誌 1 筆', 'SA1',
  $q$select public.meow_ban_email('  Banned@Example.com ', '詐騙')::text$q$, 'ban');
select pg_temp.expect_err('已在黑名單的帳號不能重複加入', 'already_banned',
  pg_temp.run_as('SA1', $q$select public.meow_ban_email('banned@example.com', '詐騙')::text$q$));
select pg_temp.expect_err('UT-HQDB-11 黑名單的 Google 帳號首次登入建立會員資料 → 拒絕', 'banned',
  pg_temp.run_as('NEWB', format($q$with i as (insert into public.meow_profiles (id) values (%L) returning 1) select count(*)::text from i$q$, pg_temp.u('NEWB'))));
select pg_temp.op_logged('UT-HQDB-06 移出黑名單寫入稽核日誌 1 筆', 'SA1',
  $q$select public.meow_unban_email('banned@example.com', '誤判')::text$q$, 'unban');
select pg_temp.expect_eq('移出黑名單後可以建立會員資料', '1',
  pg_temp.run_as('NEWB', format($q$with i as (insert into public.meow_profiles (id) values (%L) returning 1) select count(*)::text from i$q$, pg_temp.u('NEWB'))));

-- ---------------------------------------------------------------- UT-HQDB-07：稽核日誌不可修改刪除
select pg_temp.expect_err('UT-HQDB-07 SA1 update 稽核日誌 → 拒絕', 'permission denied',
  pg_temp.run_as('SA1', $q$with u as (update public.meow_audit_logs set reason = '改' returning 1) select count(*)::text from u$q$));
select pg_temp.expect_err('UT-HQDB-07 SA1 delete 稽核日誌 → 拒絕', 'permission denied',
  pg_temp.run_as('SA1', $q$with d as (delete from public.meow_audit_logs returning 1) select count(*)::text from d$q$));
select pg_temp.expect_err('UT-HQDB-07 SA1 直接 insert 稽核日誌 → 拒絕（只能經函式）', 'permission denied',
  pg_temp.run_as('SA1', format($q$with i as (insert into public.meow_audit_logs (actor_id, action, target_type, target_id, reason) values (%L, 'suspend', 'user', 'x', '偽造') returning 1) select count(*)::text from i$q$, pg_temp.u('SA1'))));
select pg_temp.expect_err('UT-HQDB-07 即使是資料表擁有者也不能 update', 'audit_logs_immutable',
  pg_temp.try_sql($q$update public.meow_audit_logs set reason = '改'$q$));
select pg_temp.expect_err('UT-HQDB-07 即使是資料表擁有者也不能 delete', 'audit_logs_immutable',
  pg_temp.try_sql($q$delete from public.meow_audit_logs$q$));
select pg_temp.expect_err('UT-HQDB-07 即使是資料表擁有者也不能 truncate', 'audit_logs_immutable',
  pg_temp.try_sql($q$truncate public.meow_audit_logs$q$));

-- ---------------------------------------------------------------- UT-HQDB-08：稽核日誌可見範圍
select pg_temp.expect_eq('UT-HQDB-08 ADU 只看到自己的紀錄',
  (select count(*)::text from public.meow_audit_logs where actor_id = pg_temp.u('ADU')),
  pg_temp.run_as('ADU', $q$select count(*)::text from public.meow_audit_logs$q$));
select pg_temp.check('UT-HQDB-08 ADU 自己的紀錄不是 0 筆（避免空轉）',
  (select count(*) from public.meow_audit_logs where actor_id = pg_temp.u('ADU')) > 0);
select pg_temp.expect_eq('UT-HQDB-08 SA1 看到全部',
  (select count(*)::text from public.meow_audit_logs), pg_temp.run_as('SA1', $q$select count(*)::text from public.meow_audit_logs$q$));
select pg_temp.check('UT-HQDB-08 ADU 看到的比全部少',
  (select count(*) from public.meow_audit_logs where actor_id = pg_temp.u('ADU')) < (select count(*) from public.meow_audit_logs));
select pg_temp.expect_eq('UT-HQDB-08 一般登入者看不到任何稽核日誌', '0', pg_temp.run_as('X', $q$select count(*)::text from public.meow_audit_logs$q$));

-- ---------------------------------------------------------------- UT-HQDB-10：模組授權表可見範圍
select pg_temp.expect_eq('UT-HQDB-10 ADU 只看到自己的授權', '1', pg_temp.run_as('ADU', $q$select count(*)::text from public.meow_admin_module_grants$q$));
select pg_temp.expect_eq('UT-HQDB-10 ADR 只看到自己的授權', '1', pg_temp.run_as('ADR', $q$select count(*)::text from public.meow_admin_module_grants$q$));
select pg_temp.expect_eq('UT-HQDB-10 SA1 看到全部授權',
  (select count(*)::text from public.meow_admin_module_grants), pg_temp.run_as('SA1', $q$select count(*)::text from public.meow_admin_module_grants$q$));
select pg_temp.expect_eq('UT-HQDB-10 一般登入者看不到授權', '0', pg_temp.run_as('X', $q$select count(*)::text from public.meow_admin_module_grants$q$));
select pg_temp.expect_err('管理員不能直接 insert 授權表', 'permission denied',
  pg_temp.run_as('ADU', format($q$with i as (insert into public.meow_admin_module_grants (admin_id, module) values (%L, 'products') returning 1) select count(*)::text from i$q$, pg_temp.u('ADU'))));

-- ---------------------------------------------------------------- 其他資料表的 RLS
select pg_temp.expect_eq('用戶權限管理者（ADU）可讀全部會員資料',
  (select count(*)::text from public.meow_profiles), pg_temp.run_as('ADU', $q$select count(*)::text from public.meow_profiles$q$));
select pg_temp.expect_eq('沒有用戶權限管理的管理員（ADP）只看到自己', '1', pg_temp.run_as('ADP', $q$select count(*)::text from public.meow_profiles$q$));
select pg_temp.expect_eq('停權紀錄：ADU 可讀', '2', pg_temp.run_as('ADU', $q$select count(*)::text from public.meow_user_suspensions$q$));
select pg_temp.expect_eq('停權紀錄：ADR（無用戶權限管理）看不到', '0', pg_temp.run_as('ADR', $q$select count(*)::text from public.meow_user_suspensions$q$));
select pg_temp.expect_eq('停權紀錄：被停權者能看到自己的紀錄（ADP）', '1', pg_temp.run_as('ADP', $q$select count(*)::text from public.meow_user_suspensions$q$));
select pg_temp.expect_eq('黑名單：SA1 可讀', '1', pg_temp.run_as('SA1', $q$select count(*)::text from public.meow_banlist$q$));
select pg_temp.expect_eq('黑名單：ADU 看不到', '0', pg_temp.run_as('ADU', $q$select count(*)::text from public.meow_banlist$q$));
select pg_temp.expect_eq('網站標誌設定：管理員（ADU）不能改', '0',
  pg_temp.run_as('ADU', $q$with u as (update public.meow_site_settings set value = '"cat"' where key = 'logo' returning 1) select count(*)::text from u$q$));
select pg_temp.expect_eq('網站標誌設定：系統管理員可以改', '1',
  pg_temp.run_as('SA1', $q$with u as (update public.meow_site_settings set value = '"cat"' where key = 'logo' returning 1) select count(*)::text from u$q$));

-- ---------------------------------------------------------------- UT-HQDB-09：最後一位系統管理員
select pg_temp.expect_ok('有兩位系統管理員時可以撤銷其中一位（SA2→管理員）',
  pg_temp.run_as('SA1', format($q$select public.meow_set_role(%L, 'admin', '職務異動')::text$q$, 'sa2@test.example')));
select pg_temp.expect_err('UT-HQDB-09 SA1 撤銷自己（最後一位）→ 拋出例外', 'last_system_admin',
  pg_temp.run_as('SA1', format($q$select public.meow_set_role(%L, 'member', '離職')::text$q$, 'sa1@test.example')));
select pg_temp.expect_err('UT-HQDB-09 直接 update 最後一位的角色 → 拋出例外', 'last_system_admin',
  pg_temp.try_sql(format($q$update public.meow_profiles set role = 'member' where id = %L$q$, pg_temp.u('SA1'))));
select pg_temp.expect_err('UT-HQDB-09 直接刪除最後一位的會員資料 → 拋出例外', 'last_system_admin',
  pg_temp.try_sql(format($q$delete from public.meow_profiles where id = %L$q$, pg_temp.u('SA1'))));
select pg_temp.expect_ok('只剩一位時，SQL 仍可指定新的系統管理員（SA2 升回）',
  pg_temp.try_sql(format($q$update public.meow_profiles set role = 'system_admin' where id = %L$q$, pg_temp.u('SA2'))));

-- ---------------------------------------------------------------- #26 審查補強
-- 黑名單只用於貓友與貓戶長；管理員、系統管理員都不能加入（Tina 2026-10-29）
create temp table adp_before as select count(*)::text as grants from public.meow_admin_module_grants where admin_id = pg_temp.u('ADP');
select pg_temp.expect_err('黑名單：不能加入管理員的帳號', 'target_is_admin',
  pg_temp.run_as('SA1', $q$select public.meow_ban_email('adp@test.example', '詐騙')::text$q$));
select pg_temp.expect_eq('黑名單：被拒絕後管理員的角色沒變、授權筆數沒變', 'admin,' || (select grants from pg_temp.adp_before),
  (select p.role || ',' || (select count(*) from public.meow_admin_module_grants where admin_id = p.id)::text from public.meow_profiles p where p.id = pg_temp.u('ADP')));
select pg_temp.expect_ok('黑名單：貓友的帳號可以加入',
  pg_temp.run_as('SA1', $q$select public.meow_ban_email('cf@test.example', '詐騙')::text$q$));
select pg_temp.expect_ok('黑名單：貓戶長的帳號可以加入',
  pg_temp.run_as('SA1', $q$select public.meow_ban_email('ho@test.example', '詐騙')::text$q$));
select pg_temp.expect_ok('黑名單：移出貓友', pg_temp.run_as('SA1', $q$select public.meow_unban_email('cf@test.example', '誤判')::text$q$));
select pg_temp.expect_ok('黑名單：移出貓戶長', pg_temp.run_as('SA1', $q$select public.meow_unban_email('ho@test.example', '誤判')::text$q$));

-- 黑名單以 auth 使用者 id 也要擋（Google Email 換了但同一個帳號）
insert into public.meow_banlist (google_email, auth_user_id, reason, banned_by)
  values ('old-address@example.com', pg_temp.u('NEWB'), '測試', pg_temp.u('SA1'));
select pg_temp.expect_err('黑名單以 auth 使用者 id 比對（Email 不同仍拒絕）', 'banned',
  pg_temp.run_as('NEWB', format($q$with i as (insert into public.meow_profiles (id) values (%L) returning 1) select count(*)::text from i$q$, pg_temp.u('NEWB'))));
update public.meow_banlist set lifted_at = now() where google_email = 'old-address@example.com';

-- 停權中的帳號不能升為管理員或系統管理員
select pg_temp.expect_ok('停權 X（升級測試用）', pg_temp.run_as('SA1', $q$select public.meow_suspend_user('00000000-0000-0000-0000-0000000000d1', '測試')::text$q$));
select pg_temp.expect_err('停權中的帳號不能升為管理員', 'target_suspended',
  pg_temp.run_as('SA1', $q$select public.meow_set_role('x@test.example', 'admin', '測試')::text$q$));
select pg_temp.expect_err('停權中的帳號不能升為系統管理員', 'target_suspended',
  pg_temp.run_as('SA1', $q$select public.meow_set_role('x@test.example', 'system_admin', '測試')::text$q$));
select pg_temp.expect_eq('升級被拒後 X 仍是一般會員', 'member', (select role from public.meow_profiles where id = pg_temp.u('X')));
select pg_temp.expect_ok('解除 X 的停權', pg_temp.run_as('SA1', $q$select public.meow_unsuspend_user('00000000-0000-0000-0000-0000000000d1', '測試結束')::text$q$));

-- ---------------------------------------------------------------- UT-HQDB-12、13
select pg_temp.skip('UT-HQDB-12 停權 HO 時自動婉拒審核中領養申請', '待領養申請資料表建立後啟用（開發任務 10）');
select pg_temp.expect_eq('UT-HQDB-13 public 的資料表全部 meow_ 開頭', '0',
  (select count(*)::text from pg_tables where schemaname = 'public' and tablename not like 'meow\_%'));
select pg_temp.expect_eq('UT-HQDB-13 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));
select pg_temp.expect_eq('UT-HQDB-13 trigger 全部 meow_ 開頭', '0',
  (select count(*)::text from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgname not like 'meow\_%'));
select pg_temp.expect_eq('UT-HQDB-13 index 全部 meow_ 開頭', '0',
  (select count(*)::text from pg_indexes where schemaname = 'public' and indexname not like 'meow\_%'));
select pg_temp.expect_eq('UT-HQDB-13 RLS policy 名稱全部以 meow_ 開頭', '0',
  (select count(*)::text from pg_policies where schemaname = 'public' and policyname not like 'meow\_%'));
select pg_temp.expect_eq('新資料表全部啟用 RLS', '0',
  (select count(*)::text from pg_tables where schemaname = 'public' and tablename in
    ('meow_admin_module_grants', 'meow_audit_logs', 'meow_user_suspensions', 'meow_banlist') and not rowsecurity));

select status, name, detail from pg_temp.test_results order by n;

rollback;
