-- 婉拒理由與移轉（0013）資料庫測試。執行方式：node supabase/tests/run-pglite.mjs。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：F 中途；A 領養人（沒有喵戶）；B 其他申請人（有一般飼主喵戶）；X 路人。輔助函式與 0004 測試相同。

begin;
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

create function pg_temp.run_as(p_code text, p_sql text) returns text language plpgsql as $fn$
declare v text; uid uuid; em text;
begin
  if p_code is not null then
    uid := pg_temp.u(p_code);
    select email into em from pg_temp.fx where code = p_code;
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'email', em)::text end, true);
  execute format('set local role %I', case when uid is null then 'anon' else 'authenticated' end);
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

create function pg_temp.expect_err(p_name text, p_code text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual like 'ERROR:%' || p_code || '%', p_actual)
$fn$;
create function pg_temp.expect_ok(p_name text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual not like 'ERROR:%', p_actual)
$fn$;
create function pg_temp.expect_eq(p_name text, p_expected text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual is not distinct from p_expected, '預期 ' || coalesce(p_expected, 'null') || '，實際 ' || coalesce(p_actual, 'null'))
$fn$;

insert into pg_temp.fx values
  ('F', '00000000-0000-0000-0000-000000000d01', 'f13@test.example'),
  ('A', '00000000-0000-0000-0000-000000000d02', 'a13@test.example'),
  ('B', '00000000-0000-0000-0000-000000000d03', 'b13@test.example'),
  ('X', '00000000-0000-0000-0000-000000000d04', 'x13@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email, display_name) select id, email, code || ' 本人' from pg_temp.fx;
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, default_visibility) values
  ('00000000-0000-0000-0000-000000000dd1', pg_temp.u('F'), '小晴的中途貓屋', 'personal_foster', '台中市', '北屯區', 'public'),
  ('00000000-0000-0000-0000-000000000dd2', pg_temp.u('B'), 'B 的家', 'cat_owner', '台北市', '大安區', 'private'),
  ('00000000-0000-0000-0000-000000000dd3', pg_temp.u('B'), 'B 的中途', 'personal_foster', '台北市', '大安區', 'public');
insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values
  ('00000000-0000-0000-0000-000000000de1', '00000000-0000-0000-0000-000000000dd1', '橘子', 'male', 'adult', 'adoptable'),
  ('00000000-0000-0000-0000-000000000de2', '00000000-0000-0000-0000-000000000dd1', '豆花', 'female', 'kitten', 'adoptable');
insert into public.meow_adoption_forms (cat_id, questions, is_open) values ('00000000-0000-0000-0000-000000000de1', '[{"id":"q1"}]', true);

create temp table ids (k text primary key, v text);
insert into pg_temp.ids select 'A1', pg_temp.run_as('A', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000de1')::text$q$);
insert into pg_temp.ids select 'B1', pg_temp.run_as('B', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000de1')::text$q$);
insert into pg_temp.ids select 'B2', pg_temp.run_as('B', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000de2')::text$q$);
create function pg_temp.id(k text) returns text language sql stable as $fn$ select v from pg_temp.ids where ids.k = id.k $fn$;

-- ---------- 婉拒理由 ----------
select pg_temp.expect_err('DEC-01 婉拒一定要寫理由', 'decline_reason_required',
  pg_temp.run_as('F', format($q$select public.meow_decline_thread('%s', '  ')::text$q$, pg_temp.id('B2'))));
select pg_temp.expect_err('DEC-02 理由最多 500 字', 'decline_reason_too_long',
  pg_temp.run_as('F', format($q$select public.meow_decline_thread('%s', repeat('喵', 501))::text$q$, pg_temp.id('B2'))));
select pg_temp.expect_err('DEC-03 申請人不能婉拒', 'thread_not_keeper',
  pg_temp.run_as('B', format($q$select public.meow_decline_thread('%s', '不要')::text$q$, pg_temp.id('B2'))));
select pg_temp.expect_ok('DEC-04 中途寫理由婉拒',
  pg_temp.run_as('F', format($q$select public.meow_decline_thread('%s', '豆花還小，需要有人全天在家照顧。')::text$q$, pg_temp.id('B2'))));
select pg_temp.expect_eq('DEC-05 對話裡先有系統事件，再有中途的理由', 'system:中途婉拒了這次的申請。|text:豆花還小，需要有人全天在家照顧。',
  pg_temp.run_as('B', format($q$select string_agg(kind || ':' || body, '|' order by created_at) from public.meow_messages where thread_id = '%s'$q$, pg_temp.id('B2'))));
select pg_temp.expect_eq('DEC-06 申請人的通知附上理由', '這次沒有媒合成功。中途的說明：豆花還小，需要有人全天在家照顧。',
  pg_temp.run_as('B', $q$select body from public.meow_notifications where type = 'adoption_status'$q$));
select pg_temp.expect_eq('DEC-07 舊的單參數婉拒已經移除', '0',
  (select count(*)::text from pg_proc where proname = 'meow_decline_thread' and pronargs = 1));

-- ---------- 移轉：中途提出 ----------
select pg_temp.expect_err('TRF-01 申請人不能提出移轉', 'thread_not_keeper',
  pg_temp.run_as('A', format($q$select public.meow_offer_transfer('%s', '橘子')::text$q$, pg_temp.id('A1'))));
select pg_temp.expect_err('TRF-02 防呆：貓名打錯不能移轉', 'transfer_confirm_mismatch',
  pg_temp.run_as('F', format($q$select public.meow_offer_transfer('%s', '橘')::text$q$, pg_temp.id('A1'))));
select pg_temp.expect_err('TRF-03 婉拒過的串不能移轉', 'transfer_not_ready',
  pg_temp.run_as('F', format($q$select public.meow_offer_transfer('%s', '豆花')::text$q$, pg_temp.id('B2'))));
insert into pg_temp.ids select 'T1', pg_temp.run_as('F', format($q$select public.meow_offer_transfer('%s', ' 橘子 ')::text$q$, pg_temp.id('A1')));
select pg_temp.check('TRF-04 中途輸入正確貓名後提出移轉', pg_temp.id('T1') ~ '^[0-9a-f-]{36}$', pg_temp.id('T1'));
select pg_temp.expect_eq('TRF-05 領養人收到通知，對話留下事件', '中途想把「橘子」交給你|1',
  pg_temp.run_as('A', format($q$select (select title from public.meow_notifications where type = 'cat_transfer') || '|' ||
    (select count(*) from public.meow_messages where thread_id = '%s' and body like '中途想把「橘子」交給%%')$q$, pg_temp.id('A1'))));
select pg_temp.expect_err('TRF-06 同一隻貓不能同時有兩筆移轉', 'transfer_pending',
  pg_temp.run_as('F', format($q$select public.meow_offer_transfer('%s', '橘子')::text$q$, pg_temp.id('B1'))));
select pg_temp.expect_eq('TRF-07 路人看不到移轉', '0',
  pg_temp.run_as('X', $q$select count(*)::text from public.meow_cat_transfers$q$));
select pg_temp.expect_err('TRF-08 前台不能直接改移轉', 'permission denied',
  pg_temp.run_as('A', $q$update public.meow_cat_transfers set status = 'accepted' returning id::text$q$));
select pg_temp.expect_err('TRF-09 其他人不能接收', 'transfer_not_pending',
  pg_temp.run_as('B', format($q$select public.meow_accept_transfer('%s')::text$q$, pg_temp.id('T1'))));

-- 取消後重新提出
select pg_temp.expect_ok('TRF-10 中途可以取消',
  pg_temp.run_as('F', format($q$select public.meow_cancel_transfer('%s')::text$q$, pg_temp.id('T1'))));
select pg_temp.expect_err('TRF-11 取消後不能再接收', 'transfer_not_pending',
  pg_temp.run_as('A', format($q$select public.meow_accept_transfer('%s')::text$q$, pg_temp.id('T1'))));
insert into pg_temp.ids select 'T2', pg_temp.run_as('F', format($q$select public.meow_offer_transfer('%s', '橘子')::text$q$, pg_temp.id('B1')));
select pg_temp.expect_err('TRF-12 轉入喵戶只能選自己的一般飼主喵戶', 'transfer_bad_household',
  pg_temp.run_as('B', format($q$select public.meow_accept_transfer('%s', '00000000-0000-0000-0000-000000000dd3')::text$q$, pg_temp.id('T2'))));
select pg_temp.expect_ok('TRF-13 申請人可以先不要',
  pg_temp.run_as('B', format($q$select public.meow_decline_transfer('%s')::text$q$, pg_temp.id('T2'))));
select pg_temp.expect_eq('TRF-14 中途收到「先不接收」通知', '1',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_notifications where type = 'cat_transfer'$q$));

-- 領養人沒有喵戶：接收時自動建立
insert into pg_temp.ids select 'T3', pg_temp.run_as('F', format($q$select public.meow_offer_transfer('%s', '橘子')::text$q$, pg_temp.id('A1')));
insert into pg_temp.ids select 'H', pg_temp.run_as('A', format($q$select public.meow_accept_transfer('%s')::text$q$, pg_temp.id('T3')));
select pg_temp.expect_eq('TRF-20 沒有喵戶時自動建立一般飼主喵戶（私人、地區沿用中途）', 'A 本人的家|cat_owner|台中市北屯區|private',
  pg_temp.run_as('A', $q$select name || '|' || caretaker_type || '|' || city || district || '|' || default_visibility from public.meow_households where owner_id = auth.uid()$q$));
select pg_temp.expect_eq('TRF-21 貓搬到新家：自家貓、記下原中途、時間軸加一筆', 'own|true|領養到新家',
  pg_temp.run_as('A', $q$select status || '|' || (origin_household_id = '00000000-0000-0000-0000-000000000dd1') || '|' || (timeline -> -1 ->> 'event')
                         from public.meow_cats where id = '00000000-0000-0000-0000-000000000de1'$q$));
select pg_temp.expect_eq('TRF-22 問卷停止填寫', 'false',
  (select is_open::text from public.meow_adoption_forms where cat_id = '00000000-0000-0000-0000-000000000de1'));
select pg_temp.expect_eq('TRF-23 領養人那串進送養追蹤並標領養人；其他申請人自動婉拒', 'A 本人:true:null|B 本人:false:declined',
  pg_temp.run_as('F', $q$select string_agg(member_name || ':' || is_adopter || ':' || case when declined_at is null then 'null' else 'declined' end, '|' order by member_name)
                         from public.meow_threads where cat_name = '橘子' and homed_at is not null$q$));
select pg_temp.expect_eq('TRF-24 中途收到「接收了」通知', 'A 本人 接收了「橘子」',
  pg_temp.run_as('F', $q$select title from public.meow_notifications where type = 'cat_transfer' and title like '%接收了%'$q$));
select pg_temp.expect_ok('TRF-25 移轉後雙方還能聊',
  pg_temp.run_as('F', format($q$select public.meow_send_message('%s', '橘子到家還習慣嗎？')::text$q$, pg_temp.id('A1'))));
select pg_temp.expect_err('TRF-26 已經移轉的貓不能再提出移轉', 'transfer_not_ready',
  pg_temp.run_as('F', format($q$select public.meow_offer_transfer('%s', '橘子')::text$q$, pg_temp.id('A1'))));

select status, name, detail from pg_temp.test_results order by n;

rollback;
