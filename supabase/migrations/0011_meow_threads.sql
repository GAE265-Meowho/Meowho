-- 0011 領養管理與私訊（#128，併入 #70）：一個「會員 × 貓」一個對話串；領養問卷送出時自動開串。
-- 回覆狀態（新收到／待回覆／等對方回／婉拒）不存在資料表，由對話串上的時間與婉拒標記推得（前端 adoption-desk 模組）。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。寫入一律走下面的函式，前端只能讀。
-- 錯誤代碼：thread_not_adoptable、thread_own_cat、thread_closed、thread_blocked、thread_not_participant、thread_not_keeper、
--   thread_cat_gone、message_suspended、message_empty、message_too_long、message_blocked、response_use_thread。

-- =========================================================
-- 對話串：喵戶長＝建立時貓所在喵戶（household_id）的擁有者。
-- 移轉後新領養人就是 member，原中途仍是喵戶長，可以繼續私訊；其他申請人的串不會給新飼主看到。
-- 貓名、喵戶名、會員名存一份：會員資料只有本人讀得到，貓移到私人喵戶後詢問者也讀不到貓。
-- =========================================================
create table if not exists public.meow_threads (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references public.meow_cats (id) on delete cascade,
  member_id uuid not null references public.meow_profiles (id) on delete cascade,
  household_id uuid not null references public.meow_households (id) on delete cascade,
  cat_name text not null,
  household_name text not null,
  member_name text not null,
  declined_at timestamptz,
  last_message_at timestamptz not null default now(),
  member_text_at timestamptz,   -- 會員最後一則文字訊息
  keeper_text_at timestamptz,   -- 喵戶長最後一則文字訊息（null＝還沒回過）
  member_read_at timestamptz,
  keeper_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cat_id, member_id)
);
create index if not exists meow_threads_member_idx on public.meow_threads (member_id, last_message_at desc);
create index if not exists meow_threads_household_idx on public.meow_threads (household_id, last_message_at desc);

create table if not exists public.meow_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.meow_threads (id) on delete cascade,
  sender_id uuid references public.meow_profiles (id) on delete set null,   -- 系統訊息為 null
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists meow_messages_thread_idx on public.meow_messages (thread_id, created_at);

-- 封鎖（GLOSSARY「封鎖」）：單向設定，任一方封鎖對方，雙方都不能在共同的對話串傳訊息
create table if not exists public.meow_blocks (
  blocker_id uuid not null references public.meow_profiles (id) on delete cascade,
  blocked_id uuid not null references public.meow_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.meow_threads enable row level security;
alter table public.meow_messages enable row level security;
alter table public.meow_blocks enable row level security;

create or replace function public.meow_thread_keeper(p_thread_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select h.owner_id from public.meow_threads t join public.meow_households h on h.id = t.household_id where t.id = p_thread_id
$$;

drop policy if exists "meow_threads: read own" on public.meow_threads;
create policy "meow_threads: read own" on public.meow_threads for select using (
  member_id = auth.uid()
  or exists (select 1 from public.meow_households h where h.id = meow_threads.household_id and h.owner_id = auth.uid())
);
drop policy if exists "meow_messages: read own threads" on public.meow_messages;
create policy "meow_messages: read own threads" on public.meow_messages for select using (
  exists (select 1 from public.meow_threads t where t.id = meow_messages.thread_id)
);
drop policy if exists "meow_blocks: own" on public.meow_blocks;
create policy "meow_blocks: own" on public.meow_blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create or replace function public.meow_is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meow_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

-- 新訊息通知：同一串在對方讀之前只留一則未讀通知，更新內容與時間
create or replace function public.meow_notify_message(p_user uuid, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.meow_notifications set title = p_title, body = p_body, created_at = now()
   where user_id = p_user and type = 'message' and link = p_link and read_at is null;
  if not found then
    insert into public.meow_notifications (user_id, type, title, body, link) values (p_user, 'message', p_title, p_body, p_link);
  end if;
end $$;

-- 寫入一則系統訊息（只給本檔的函式與 trigger 用）
create or replace function public.meow_thread_event(p_thread_id uuid, p_body text, p_at timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.meow_messages (thread_id, kind, body, created_at) values (p_thread_id, 'system', p_body, p_at);
  update public.meow_threads set last_message_at = greatest(last_message_at, p_at) where id = p_thread_id;
end $$;

-- 找到或建立（貓, 會員）的對話串；不做權限檢查，呼叫端自己檢查
create or replace function public.meow_ensure_thread(p_cat_id uuid, p_member uuid, p_member_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid; c public.meow_cats; h public.meow_households;
begin
  select id into tid from public.meow_threads where cat_id = p_cat_id and member_id = p_member;
  if tid is not null then return tid; end if;
  select * into c from public.meow_cats where id = p_cat_id;
  select * into h from public.meow_households where id = c.household_id;
  insert into public.meow_threads (cat_id, member_id, household_id, cat_name, household_name, member_name, member_read_at)
  values (c.id, p_member, h.id, c.name, h.name,
          coalesce(nullif(trim(p_member_name), ''), (select nullif(trim(display_name), '') from public.meow_profiles where id = p_member), '會員'),
          now())
  on conflict (cat_id, member_id) do nothing
  returning id into tid;
  if tid is null then select id into tid from public.meow_threads where cat_id = p_cat_id and member_id = p_member; end if;
  return tid;
end $$;

-- =========================================================
-- 會員開啟對話串（貓咪頁「傳訊息給喵戶長」）：已有就直接回傳
-- =========================================================
create or replace function public.meow_open_thread(p_cat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid; c public.meow_cats; h public.meow_households;
begin
  select id into tid from public.meow_threads where cat_id = p_cat_id and member_id = auth.uid();
  if tid is not null then return tid; end if;
  if auth.uid() is null or public.meow_is_suspended(auth.uid()) then
    raise exception 'message_suspended' using errcode = 'P0001', hint = '目前無法傳送訊息';
  end if;
  select * into c from public.meow_cats where id = p_cat_id;
  if c.id is null or c.status <> 'adoptable' then
    raise exception 'thread_not_adoptable' using errcode = 'P0001', hint = '只能私訊待領養貓的喵戶長';
  end if;
  select * into h from public.meow_households where id = c.household_id;
  if h.owner_id = auth.uid() then
    raise exception 'thread_own_cat' using errcode = 'P0001', hint = '這是你自己的貓';
  end if;
  if not h.allow_stranger_messages then
    raise exception 'thread_closed' using errcode = 'P0001', hint = '這個喵戶目前不接受私訊';
  end if;
  if public.meow_is_blocked(auth.uid(), h.owner_id) then
    raise exception 'thread_blocked' using errcode = 'P0001', hint = '你們之間有封鎖設定';
  end if;
  return public.meow_ensure_thread(c.id, auth.uid(), null);
end $$;

-- =========================================================
-- 傳訊息：雙方都可以；婉拒後也還能聊
-- =========================================================
create or replace function public.meow_send_message(p_thread_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.meow_threads; keeper uuid; me text; txt text := trim(coalesce(p_body, '')); mid uuid; other uuid; link text; title text;
begin
  select * into t from public.meow_threads where id = p_thread_id for update;
  keeper := public.meow_thread_keeper(p_thread_id);
  if t.id is null or auth.uid() is null or (auth.uid() is distinct from t.member_id and auth.uid() is distinct from keeper) then
    raise exception 'thread_not_participant' using errcode = 'P0001', hint = '找不到這段對話';
  end if;
  me := case when auth.uid() = t.member_id then 'member' else 'keeper' end;
  if public.meow_is_suspended(auth.uid()) then
    raise exception 'message_suspended' using errcode = 'P0001', hint = '目前無法傳送訊息';
  end if;
  if txt = '' then raise exception 'message_empty' using errcode = 'P0001', hint = '請輸入訊息'; end if;
  if char_length(txt) > 1000 then raise exception 'message_too_long' using errcode = 'P0001', hint = '訊息最多 1000 字'; end if;
  if public.meow_is_blocked(t.member_id, keeper) then
    raise exception 'message_blocked' using errcode = 'P0001', hint = '你們之間有封鎖設定，無法傳送';
  end if;
  insert into public.meow_messages (thread_id, sender_id, kind, body) values (t.id, auth.uid(), 'text', txt) returning id into mid;
  if me = 'member' then
    update public.meow_threads set last_message_at = now(), member_text_at = now(), member_read_at = now() where id = t.id;
    other := keeper; link := '/me/adoptions?t=' || t.id; title := t.member_name || ' 傳了新訊息';
  else
    update public.meow_threads set last_message_at = now(), keeper_text_at = now(), keeper_read_at = now() where id = t.id;
    other := t.member_id; link := '/me/applications?t=' || t.id; title := '「' || t.household_name || '」傳了新訊息';
  end if;
  perform public.meow_notify_message(other, title, '關於「' || t.cat_name || '」：' || left(txt, 60), link);
  return mid;
end $$;

-- 打開對話時標為已讀，連同這串的訊息通知
create or replace function public.meow_mark_thread_read(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_threads; keeper uuid;
begin
  select * into t from public.meow_threads where id = p_thread_id;
  keeper := public.meow_thread_keeper(p_thread_id);
  if t.id is null or auth.uid() is null or (auth.uid() is distinct from t.member_id and auth.uid() is distinct from keeper) then
    raise exception 'thread_not_participant' using errcode = 'P0001', hint = '找不到這段對話';
  end if;
  if auth.uid() = t.member_id then update public.meow_threads set member_read_at = now() where id = t.id; end if;
  if auth.uid() = keeper then update public.meow_threads set keeper_read_at = now() where id = t.id; end if;
  update public.meow_notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and link in ('/me/adoptions?t=' || t.id, '/me/applications?t=' || t.id);
end $$;

-- 在對話框封鎖／解除封鎖對方（對方的 id 不必給前端）；回傳目前狀態：i_blocked（我封鎖對方）、blocked（對方封鎖我）、none
create or replace function public.meow_thread_block_state(p_thread_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare t public.meow_threads; keeper uuid; other uuid;
begin
  select * into t from public.meow_threads where id = p_thread_id;
  keeper := public.meow_thread_keeper(p_thread_id);
  if t.id is null or auth.uid() is null or (auth.uid() is distinct from t.member_id and auth.uid() is distinct from keeper) then
    raise exception 'thread_not_participant' using errcode = 'P0001', hint = '找不到這段對話';
  end if;
  other := case when auth.uid() = t.member_id then keeper else t.member_id end;
  if exists (select 1 from public.meow_blocks where blocker_id = auth.uid() and blocked_id = other) then return 'i_blocked'; end if;
  if exists (select 1 from public.meow_blocks where blocker_id = other and blocked_id = auth.uid()) then return 'blocked'; end if;
  return 'none';
end $$;

create or replace function public.meow_set_thread_block(p_thread_id uuid, p_block boolean)
returns text language plpgsql security definer set search_path = public as $$
declare t public.meow_threads; keeper uuid; other uuid;
begin
  select * into t from public.meow_threads where id = p_thread_id;
  keeper := public.meow_thread_keeper(p_thread_id);
  if t.id is null or auth.uid() is null or (auth.uid() is distinct from t.member_id and auth.uid() is distinct from keeper) then
    raise exception 'thread_not_participant' using errcode = 'P0001', hint = '找不到這段對話';
  end if;
  other := case when auth.uid() = t.member_id then keeper else t.member_id end;
  if p_block then
    insert into public.meow_blocks (blocker_id, blocked_id) values (auth.uid(), other) on conflict do nothing;
  else
    delete from public.meow_blocks where blocker_id = auth.uid() and blocked_id = other;
  end if;
  return public.meow_thread_block_state(p_thread_id);
end $$;

-- =========================================================
-- 婉拒與恢復：只有喵戶長；婉拒通知會員，恢復不通知
-- =========================================================
create or replace function public.meow_decline_thread(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_threads;
begin
  select * into t from public.meow_threads where id = p_thread_id for update;
  if t.id is null or auth.uid() is null or public.meow_thread_keeper(p_thread_id) is distinct from auth.uid() then
    raise exception 'thread_not_keeper' using errcode = 'P0001', hint = '只有喵戶長能婉拒';
  end if;
  if t.declined_at is not null then return; end if;
  -- 同一個交易裡 now() 不變，所以「已讀時間＝最後訊息時間」，自己的動作不會算成未讀
  update public.meow_threads set declined_at = now(), keeper_read_at = now() where id = t.id;
  perform public.meow_thread_event(t.id, '中途婉拒了這次的申請。');
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (t.member_id, 'adoption_status', '「' || t.cat_name || '」的領養申請有新進度',
          '這次沒有媒合成功，謝謝你願意給貓一個家。', '/me/applications?t=' || t.id);
end $$;

create or replace function public.meow_restore_thread(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_threads;
begin
  select * into t from public.meow_threads where id = p_thread_id for update;
  if t.id is null or auth.uid() is null or public.meow_thread_keeper(p_thread_id) is distinct from auth.uid() then
    raise exception 'thread_not_keeper' using errcode = 'P0001', hint = '只有喵戶長能恢復';
  end if;
  if t.declined_at is null then return; end if;
  if not exists (select 1 from public.meow_cats where id = t.cat_id and household_id = t.household_id and status = 'adoptable') then
    raise exception 'thread_cat_gone' using errcode = 'P0001', hint = '這隻貓已經不在你的喵戶等家了';
  end if;
  update public.meow_threads set declined_at = null, keeper_read_at = now() where id = t.id;
  perform public.meow_thread_event(t.id, '中途恢復了這份申請。');
end $$;

-- =========================================================
-- 領養問卷：送出時開串並寫入系統事件、通知喵戶長（取代 0010 的同名函式）。
-- 喵戶長不再手動改回覆狀態（#128），回覆的 status 只剩「草稿／已送出」的意義。
-- =========================================================
create or replace function public.meow_adoption_response_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    null;  -- SQL Editor／資料庫函式
  elsif tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception 'response_bad_status' using errcode = 'P0001';
    end if;
  elsif auth.uid() = old.respondent_id then
    if old.status <> 'draft' then
      raise exception 'response_locked' using errcode = 'P0001', hint = '問卷送出後就不能再修改';
    end if;
    if new.status not in ('draft', 'submitted') then
      raise exception 'response_bad_status' using errcode = 'P0001';
    end if;
    new.form_id := old.form_id;
    new.respondent_id := old.respondent_id;
  else
    raise exception 'response_use_thread' using errcode = 'P0001', hint = '申請狀態改由對話判斷，婉拒請在領養管理按「婉拒」';
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    new.submitted_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.meow_notify_adoption_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; owner uuid; who text; tid uuid;
begin
  if not (new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft')) then return new; end if;
  select cat.* into c from public.meow_adoption_forms f join public.meow_cats cat on cat.id = f.cat_id where f.id = new.form_id;
  select owner_id into owner from public.meow_households where id = c.household_id;
  if owner is null or owner = new.respondent_id then return new; end if;
  who := coalesce(nullif(trim(new.respondent_name), ''), '一位會員');
  tid := public.meow_ensure_thread(c.id, new.respondent_id, new.respondent_name);
  -- 婉拒後重新送出問卷，視為新的申請
  update public.meow_threads set declined_at = null, member_read_at = now() where id = tid;
  perform public.meow_thread_event(tid, who || ' 送出了領養問卷。');
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (owner, 'adoption_response', '有人想領養「' || c.name || '」',
          who || ' 填好了「' || c.name || '」的領養問卷。', '/me/adoptions?t=' || tid);
  return new;
end $$;

-- =========================================================
-- 移轉：貓搬到領養人的喵戶（有原中途）時，其他人的對話串自動婉拒並留一則固定文案
-- =========================================================
create or replace function public.meow_threads_on_transfer()
returns trigger language plpgsql security definer set search_path = public as $$
declare adopter uuid; t record;
begin
  if new.household_id is not distinct from old.household_id or new.origin_household_id is null then return new; end if;
  select owner_id into adopter from public.meow_households where id = new.household_id;
  for t in select id, member_id, cat_name from public.meow_threads
            where cat_id = new.id and member_id is distinct from adopter and declined_at is null loop
    update public.meow_threads set declined_at = now(), keeper_read_at = now() where id = t.id;
    perform public.meow_thread_event(t.id, '「' || t.cat_name || '」已經找到家了。謝謝你的關心，也歡迎認識其他正在等家的貓。');
    insert into public.meow_notifications (user_id, type, title, body, link)
    values (t.member_id, 'adoption_status', '「' || t.cat_name || '」的領養申請有新進度',
            '「' || t.cat_name || '」已經找到家了，謝謝你願意給貓一個家。', '/me/applications?t=' || t.id);
  end loop;
  return new;
end $$;
drop trigger if exists meow_cats_threads_on_transfer on public.meow_cats;
create trigger meow_cats_threads_on_transfer after update of household_id on public.meow_cats
  for each row execute function public.meow_threads_on_transfer();

-- =========================================================
-- 既有資料：已送出的問卷各開一串（時間沿用送出時間）；待聯絡／進一步了解改回已送出，婉拒轉成對話串的婉拒標記
-- =========================================================
with src as (
  select distinct on (f.cat_id, r.respondent_id)
         f.cat_id, r.respondent_id, r.respondent_name, r.status, coalesce(r.submitted_at, r.created_at) as at, r.updated_at,
         c.name as cat_name, h.id as household_id, h.name as household_name
    from public.meow_adoption_responses r
    join public.meow_adoption_forms f on f.id = r.form_id
    join public.meow_cats c on c.id = f.cat_id
    join public.meow_households h on h.id = c.household_id
   where r.status <> 'draft' and h.owner_id <> r.respondent_id
   order by f.cat_id, r.respondent_id, r.created_at desc
), ins as (
  insert into public.meow_threads (cat_id, member_id, household_id, cat_name, household_name, member_name,
                                   declined_at, last_message_at, member_read_at, keeper_read_at, created_at)
  select cat_id, respondent_id, household_id, cat_name, household_name,
         coalesce(nullif(trim(respondent_name), ''), '會員'),
         case when status = 'declined' then updated_at end, at, at,
         case when status <> 'submitted' then updated_at end, at
    from src
  on conflict (cat_id, member_id) do nothing
  returning id, member_name, created_at
)
insert into public.meow_messages (thread_id, kind, body, created_at)
select id, 'system', member_name || ' 送出了領養問卷。', created_at from ins;

update public.meow_adoption_responses set status = 'submitted' where status in ('contact', 'follow_up');

-- =========================================================
-- 權限：只開放函式給登入會員；內部輔助函式不給前端呼叫
-- =========================================================
revoke all on function public.meow_open_thread(uuid) from public;
revoke all on function public.meow_send_message(uuid, text) from public;
revoke all on function public.meow_mark_thread_read(uuid) from public;
revoke all on function public.meow_decline_thread(uuid) from public;
revoke all on function public.meow_restore_thread(uuid) from public;
revoke all on function public.meow_thread_block_state(uuid) from public;
revoke all on function public.meow_set_thread_block(uuid, boolean) from public;
revoke all on function public.meow_ensure_thread(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.meow_thread_event(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.meow_notify_message(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.meow_open_thread(uuid) to authenticated;
grant execute on function public.meow_send_message(uuid, text) to authenticated;
grant execute on function public.meow_mark_thread_read(uuid) to authenticated;
grant execute on function public.meow_decline_thread(uuid) to authenticated;
grant execute on function public.meow_restore_thread(uuid) to authenticated;
grant execute on function public.meow_thread_block_state(uuid) to authenticated;
grant execute on function public.meow_set_thread_block(uuid, boolean) to authenticated;
revoke insert, update, delete on public.meow_threads, public.meow_messages from anon, authenticated;

-- 即時更新（Supabase Realtime）：把兩張表加進 Supabase 內建的 supabase_realtime 發布，讀取仍受上面的 RLS 限制。
-- 本機測試資料庫沒有這個發布，會略過。
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'meow_messages') then
      alter publication supabase_realtime add table public.meow_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'meow_threads') then
      alter publication supabase_realtime add table public.meow_threads;
    end if;
  end if;
end $$;
