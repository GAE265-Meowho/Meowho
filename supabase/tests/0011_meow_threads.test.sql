-- 領養管理與私訊（0011）資料庫測試。執行方式：node supabase/tests/run-pglite.mjs。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：F 中途（喵戶長）；A、B 領養人；X 路人；S 停權會員。輔助函式與 0004 測試相同。

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
  ('F', '00000000-0000-0000-0000-000000000b01', 'f11@test.example'),
  ('A', '00000000-0000-0000-0000-000000000b02', 'a11@test.example'),
  ('B', '00000000-0000-0000-0000-000000000b03', 'b11@test.example'),
  ('X', '00000000-0000-0000-0000-000000000b04', 'x11@test.example'),
  ('S', '00000000-0000-0000-0000-000000000b05', 's11@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email, display_name) select id, email, code || ' 本人' from pg_temp.fx;
insert into public.meow_user_suspensions (user_id, reason) values (pg_temp.u('S'), '測試');
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, default_visibility) values
  ('00000000-0000-0000-0000-000000000bd1', pg_temp.u('F'), '小晴的中途貓屋', 'personal_foster', '台中市', '北屯區', 'public'),
  ('00000000-0000-0000-0000-000000000bd2', pg_temp.u('F'), '小晴自己家', 'cat_owner', '台中市', '北屯區', 'public'),
  ('00000000-0000-0000-0000-000000000bd3', pg_temp.u('A'), 'A 的新家', 'cat_owner', '台北市', '大安區', 'private');
insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values
  ('00000000-0000-0000-0000-000000000be1', '00000000-0000-0000-0000-000000000bd1', '橘子', 'male', 'adult', 'adoptable'),
  ('00000000-0000-0000-0000-000000000be2', '00000000-0000-0000-0000-000000000bd2', '小晴的貓', 'female', 'adult', 'own'),
  ('00000000-0000-0000-0000-000000000be3', '00000000-0000-0000-0000-000000000bd1', '豆花', 'female', 'kitten', 'adoptable');
insert into public.meow_adoption_forms (id, cat_id, questions, is_open) values
  ('00000000-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000be1', '[{"id":"q1"}]', true),
  ('00000000-0000-0000-0000-000000000bf3', '00000000-0000-0000-0000-000000000be3', '[{"id":"q1"}]', true);

create temp table ids (k text primary key, v text);
grant all on pg_temp.ids to authenticated, anon;

-- ---------- 開串 ----------
insert into pg_temp.ids select 'tA', pg_temp.run_as('A', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000be1')::text$q$);
select pg_temp.check('THR-01 會員可以私訊待領養貓的喵戶長', (select v from pg_temp.ids where k = 'tA') ~ '^[0-9a-f-]{36}$', (select v from pg_temp.ids where k = 'tA'));
select pg_temp.expect_eq('THR-02 再開一次是同一串', (select v from pg_temp.ids where k = 'tA'),
  pg_temp.run_as('A', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000be1')::text$q$));
select pg_temp.expect_err('THR-03 喵戶長不能私訊自己的貓', 'thread_own_cat',
  pg_temp.run_as('F', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000be1')::text$q$));
select pg_temp.expect_err('THR-04 非待領養貓不能開新串', 'thread_not_adoptable',
  pg_temp.run_as('A', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000be2')::text$q$));
select pg_temp.expect_err('THR-05 停權會員不能開串', 'message_suspended',
  pg_temp.run_as('S', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000be1')::text$q$));
select pg_temp.expect_eq('THR-06 對話串記下貓名、喵戶名、會員名', '橘子|小晴的中途貓屋|A 本人',
  pg_temp.run_as('F', $q$select cat_name || '|' || household_name || '|' || member_name from public.meow_threads$q$));

-- ---------- 誰看得到 ----------
select pg_temp.expect_eq('THR-07 路人看不到別人的對話串', '0',
  pg_temp.run_as('X', $q$select count(*)::text from public.meow_threads$q$));
select pg_temp.expect_eq('THR-08 未登入看不到對話串', '0',
  pg_temp.run_as(null, $q$select count(*)::text from public.meow_threads$q$));

-- ---------- 傳訊息 ----------
select pg_temp.expect_err('THR-10 空白訊息送不出去', 'message_empty',
  pg_temp.run_as('A', format($q$select public.meow_send_message('%s', '   ')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_err('THR-11 超過 1000 字送不出去', 'message_too_long',
  pg_temp.run_as('A', format($q$select public.meow_send_message('%s', repeat('喵', 1001))::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_ok('THR-12 會員傳訊息',
  pg_temp.run_as('A', format($q$select public.meow_send_message('%s', '週末方便去看橘子嗎？')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_eq('THR-13 喵戶長收到訊息通知，連到領養管理的這一串', 'A 本人 傳了新訊息|/me/adoptions?t=' || (select v from pg_temp.ids where k = 'tA'),
  pg_temp.run_as('F', $q$select title || '|' || link from public.meow_notifications where type = 'message'$q$));
select pg_temp.expect_ok('THR-14 會員再傳一則',
  pg_temp.run_as('A', format($q$select public.meow_send_message('%s', '我住在附近')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_eq('THR-15 對方還沒讀時只留一則未讀通知，內容是最新一則', '1|關於「橘子」：我住在附近',
  pg_temp.run_as('F', $q$select count(*)::text || '|' || max(body) from public.meow_notifications where type = 'message' and read_at is null$q$));
select pg_temp.expect_eq('THR-16 路人讀不到訊息', '0',
  pg_temp.run_as('X', $q$select count(*)::text from public.meow_messages$q$));
select pg_temp.expect_err('THR-17 路人不能傳到別人的對話串', 'thread_not_participant',
  pg_temp.run_as('X', format($q$select public.meow_send_message('%s', '你好')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_err('THR-18 前台不能直接寫系統訊息', 'permission denied',
  pg_temp.run_as('A', format($q$insert into public.meow_messages (thread_id, kind, body) values ('%s', 'system', '中途婉拒了這次的申請。') returning id::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_err('THR-19 訊息不能修改', 'permission denied',
  pg_temp.run_as('A', $q$update public.meow_messages set body = '改掉' returning id::text$q$));
select pg_temp.expect_err('THR-20 訊息不能刪除', 'permission denied',
  pg_temp.run_as('A', $q$delete from public.meow_messages returning id::text$q$));
select pg_temp.expect_err('THR-21 前台不能自己改對話串（例如偷改婉拒）', 'permission denied',
  pg_temp.run_as('F', $q$update public.meow_threads set declined_at = now() returning id::text$q$));
select pg_temp.expect_ok('THR-22 喵戶長回覆',
  pg_temp.run_as('F', format($q$select public.meow_send_message('%s', '可以喔，週六下午見')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_eq('THR-23 會員收到通知，連到我的領養申請', '「小晴的中途貓屋」傳了新訊息|/me/applications?t=' || (select v from pg_temp.ids where k = 'tA'),
  pg_temp.run_as('A', $q$select title || '|' || link from public.meow_notifications where type = 'message'$q$));
select pg_temp.expect_eq('THR-24 雙方的最後文字時間都有記錄', 'true|true',
  pg_temp.run_as('F', $q$select (member_text_at is not null)::text || '|' || (keeper_text_at is not null)::text from public.meow_threads$q$));
select pg_temp.expect_ok('THR-25 喵戶長打開對話標為已讀',
  pg_temp.run_as('F', format($q$select public.meow_mark_thread_read('%s')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_eq('THR-26 標為已讀後，這串的訊息通知也已讀', '0',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_notifications where type = 'message' and read_at is null$q$));
select pg_temp.expect_err('THR-27 路人不能標別人的對話已讀', 'thread_not_participant',
  pg_temp.run_as('X', format($q$select public.meow_mark_thread_read('%s')::text$q$, (select v from pg_temp.ids where k = 'tA'))));

-- ---------- 封鎖 ----------
select pg_temp.expect_ok('THR-30 會員封鎖喵戶長',
  pg_temp.run_as('A', format($q$insert into public.meow_blocks (blocker_id, blocked_id) values ('%s', '%s') returning 'ok'$q$, pg_temp.u('A'), pg_temp.u('F'))));
select pg_temp.expect_err('THR-31 封鎖後喵戶長不能傳', 'message_blocked',
  pg_temp.run_as('F', format($q$select public.meow_send_message('%s', '還在嗎？')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_err('THR-32 封鎖的人自己也不能傳', 'message_blocked',
  pg_temp.run_as('A', format($q$select public.meow_send_message('%s', '在')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_err('THR-33 封鎖後不能私訊對方的其他貓', 'thread_blocked',
  pg_temp.run_as('A', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000be3')::text$q$));
select pg_temp.expect_eq('THR-34 封鎖只有自己看得到', '0',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_blocks$q$));
select pg_temp.expect_err('THR-35 不能替別人建立封鎖', 'row-level security',
  pg_temp.run_as('X', format($q$insert into public.meow_blocks (blocker_id, blocked_id) values ('%s', '%s') returning 'ok'$q$, pg_temp.u('F'), pg_temp.u('A'))));
select pg_temp.expect_ok('THR-36 解除封鎖',
  pg_temp.run_as('A', $q$delete from public.meow_blocks returning 'ok'$q$));
select pg_temp.expect_ok('THR-37 解除後恢復傳訊息',
  pg_temp.run_as('F', format($q$select public.meow_send_message('%s', '還在嗎？')::text$q$, (select v from pg_temp.ids where k = 'tA'))));

select pg_temp.expect_eq('THR-38 在對話框封鎖對方，回傳狀態', 'i_blocked',
  pg_temp.run_as('F', format($q$select public.meow_set_thread_block('%s', true)$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_eq('THR-39 對方看到自己被封鎖；解除後恢復', 'blocked|none',
  pg_temp.run_as('A', format($q$select public.meow_thread_block_state('%s')$q$, (select v from pg_temp.ids where k = 'tA'))) || '|' ||
  pg_temp.run_as('F', format($q$select public.meow_set_thread_block('%s', false)$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_err('THR-39b 路人不能查別人對話的封鎖狀態', 'thread_not_participant',
  pg_temp.run_as('X', format($q$select public.meow_thread_block_state('%s')$q$, (select v from pg_temp.ids where k = 'tA'))));

-- ---------- 婉拒與恢復 ----------
select pg_temp.expect_err('THR-40 會員不能婉拒', 'thread_not_keeper',
  pg_temp.run_as('A', format($q$select public.meow_decline_thread('%s')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_ok('THR-41 喵戶長婉拒',
  pg_temp.run_as('F', format($q$select public.meow_decline_thread('%s')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_eq('THR-42 婉拒留下系統事件', '1',
  pg_temp.run_as('A', $q$select count(*)::text from public.meow_messages where kind = 'system' and body = '中途婉拒了這次的申請。'$q$));
select pg_temp.expect_eq('THR-43 婉拒通知會員', '「橘子」的領養申請有新進度',
  pg_temp.run_as('A', $q$select title from public.meow_notifications where type = 'adoption_status'$q$));
select pg_temp.expect_ok('THR-44 婉拒後還能聊',
  pg_temp.run_as('A', format($q$select public.meow_send_message('%s', '了解，謝謝')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_err('THR-45 會員不能恢復', 'thread_not_keeper',
  pg_temp.run_as('A', format($q$select public.meow_restore_thread('%s')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_ok('THR-46 喵戶長恢復',
  pg_temp.run_as('F', format($q$select public.meow_restore_thread('%s')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_eq('THR-47 恢復後婉拒標記清掉，留下系統事件，不另外通知', 'null|1|1',
  pg_temp.run_as('A', $q$select coalesce((select declined_at::text from public.meow_threads), 'null') || '|' ||
    (select count(*) from public.meow_messages where body = '中途恢復了這份申請。') || '|' ||
    (select count(*) from public.meow_notifications where type = 'adoption_status')$q$));

-- ---------- 領養問卷 ----------
update public.meow_households set allow_stranger_messages = false where id = '00000000-0000-0000-0000-000000000bd1';
select pg_temp.expect_err('THR-50 喵戶不接受陌生人私訊時不能開串', 'thread_closed',
  pg_temp.run_as('B', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000be1')::text$q$));
select pg_temp.expect_ok('THR-51 但可以送出領養問卷',
  pg_temp.run_as('B', format($q$insert into public.meow_adoption_responses (form_id, respondent_id, respondent_name, status) values ('00000000-0000-0000-0000-000000000bf1', '%s', '小美', 'submitted') returning id::text$q$, pg_temp.u('B'))));
select pg_temp.expect_eq('THR-52 送出問卷自動開串，留下系統事件', '小美|小美 送出了領養問卷。',
  pg_temp.run_as('B', $q$select t.member_name || '|' || m.body from public.meow_threads t join public.meow_messages m on m.thread_id = t.id$q$));
select pg_temp.expect_eq('THR-53 喵戶長收到通知，連到這一串', '1',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_notifications n join public.meow_threads t on n.link = '/me/adoptions?t=' || t.id
                         where n.type = 'adoption_response' and t.member_name = '小美'$q$));
select pg_temp.expect_ok('THR-54 先私訊過的會員送出問卷',
  pg_temp.run_as('A', format($q$insert into public.meow_adoption_responses (form_id, respondent_id, respondent_name, status) values ('00000000-0000-0000-0000-000000000bf1', '%s', 'A 本人', 'submitted') returning id::text$q$, pg_temp.u('A'))));
select pg_temp.expect_eq('THR-55 先私訊再送問卷是同一串', '1|1',
  pg_temp.run_as('A', $q$select count(*)::text || '|' || (select count(*) from public.meow_messages where body = 'A 本人 送出了領養問卷。') from public.meow_threads$q$));
select pg_temp.expect_err('THR-56 喵戶長不能再手動改回覆狀態', 'response_use_thread',
  pg_temp.run_as('F', $q$update public.meow_adoption_responses set status = 'contact' returning id::text$q$));
select pg_temp.expect_ok('THR-57 路人存問卷草稿',
  pg_temp.run_as('X', format($q$insert into public.meow_adoption_responses (form_id, respondent_id, status) values ('00000000-0000-0000-0000-000000000bf3', '%s', 'draft') returning id::text$q$, pg_temp.u('X'))));
select pg_temp.expect_eq('THR-58 草稿不會開串', '0',
  (select count(*)::text from public.meow_threads where member_id = pg_temp.u('X')));

-- ---------- 移轉 ----------
-- 移轉流程還沒做（#128 不含），用管理身分模擬：橘子搬到 A 的新家，原中途是小晴的中途貓屋
select set_config('meow.cat_flow', 'on', true);
update public.meow_cats set household_id = '00000000-0000-0000-0000-000000000bd3', status = 'own',
       origin_household_id = '00000000-0000-0000-0000-000000000bd1'
 where id = '00000000-0000-0000-0000-000000000be1';
select set_config('meow.cat_flow', '', true);
select pg_temp.expect_eq('THR-60 移轉後其他申請人的串自動婉拒，收到固定文案', '1|1',
  pg_temp.run_as('B', $q$select (select count(*) from public.meow_threads where declined_at is not null)::text || '|' ||
    (select count(*) from public.meow_messages where body like '「橘子」已經找到家了%')$q$));
select pg_temp.expect_eq('THR-61 其他申請人收到通知', '1',
  pg_temp.run_as('B', $q$select count(*)::text from public.meow_notifications where type = 'adoption_status'$q$));
select pg_temp.expect_eq('THR-62 新領養人自己的串不受影響', 'null',
  pg_temp.run_as('A', $q$select coalesce(declined_at::text, 'null') from public.meow_threads$q$));
select pg_temp.expect_eq('THR-63 新領養人看不到其他申請人的串', '1',
  pg_temp.run_as('A', $q$select count(*)::text from public.meow_threads$q$));
select pg_temp.expect_ok('THR-64 原中途可以繼續私訊新領養人',
  pg_temp.run_as('F', format($q$select public.meow_send_message('%s', '橘子適應得還好嗎？')::text$q$, (select v from pg_temp.ids where k = 'tA'))));
select pg_temp.expect_ok('THR-65 其他申請人的串仍然可以使用',
  pg_temp.run_as('B', $q$select public.meow_send_message(id, '恭喜橘子')::text from public.meow_threads$q$));
select pg_temp.expect_err('THR-66 貓已經不在喵戶時不能恢復', 'thread_cat_gone',
  pg_temp.run_as('F', $q$select public.meow_restore_thread(id)::text from public.meow_threads where member_name = '小美'$q$));

select pg_temp.expect_eq('THR-90 內部輔助函式前端不能呼叫', 'false|false|false',
  (select string_agg(has_function_privilege('authenticated', p::regprocedure, 'execute')::text, '|' order by p)
     from unnest(array['public.meow_ensure_thread(uuid,uuid,text)', 'public.meow_thread_event(uuid,text,timestamptz)', 'public.meow_notify_message(uuid,text,text,text)']) p));
select pg_temp.expect_eq('THR-91 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));

select status, name, detail from pg_temp.test_results order by n;

rollback;
