-- 0012 送養追蹤（#128）：貓從中途找到家之後，牠的對話串都移到「送養追蹤」，領養人那一串置頂。
-- 移轉後中途通常讀不到貓本身（可能在領養人的私人喵戶），所以把結果記在對話串上。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。

alter table public.meow_threads add column if not exists homed_at timestamptz;          -- 這隻貓從這個喵戶找到家的時間
alter table public.meow_threads add column if not exists is_adopter boolean not null default false;  -- 這串的會員就是領養人

-- 標記（貓, 原中途喵戶）的所有串找到家；領養人沒有串時建一串給中途追蹤近況
create or replace function public.meow_mark_cat_homed(p_cat_id uuid, p_origin uuid, p_adopter uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare tid uuid; c public.meow_cats; h public.meow_households;
begin
  select * into c from public.meow_cats where id = p_cat_id;
  select * into h from public.meow_households where id = p_origin;
  if c.id is null or h.id is null or p_adopter is null or p_adopter = h.owner_id then return; end if;
  select id into tid from public.meow_threads where cat_id = p_cat_id and member_id = p_adopter;
  if tid is null then
    insert into public.meow_threads (cat_id, member_id, household_id, cat_name, household_name, member_name, last_message_at, member_read_at, created_at)
    values (c.id, p_adopter, h.id, c.name, h.name,
            coalesce((select nullif(trim(display_name), '') from public.meow_profiles where id = p_adopter), '會員'), p_at, p_at, p_at)
    on conflict (cat_id, member_id) do nothing
    returning id into tid;
    if tid is not null then
      perform public.meow_thread_event(tid, '「' || c.name || '」正式成為你的家人了。', p_at);
      update public.meow_threads set keeper_read_at = p_at where id = tid;
    end if;
  end if;
  update public.meow_threads set homed_at = coalesce(homed_at, p_at), is_adopter = (member_id = p_adopter)
   where cat_id = p_cat_id and household_id = p_origin;
end $$;

-- 移轉：取代 0011 的同名函式，多記下送養追蹤
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
            '「' || t.cat_name || '」已經找到家了，謝謝你願意給貓一個家。', '/me/adoptions?t=' || t.id);
  end loop;
  perform public.meow_mark_cat_homed(new.id, old.household_id, adopter, now());
  return new;
end $$;

-- 退養收回後貓重新等家：同一位會員再私訊或送問卷時，沿用原串並移回一般分類
create or replace function public.meow_open_thread(p_cat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid; c public.meow_cats; h public.meow_households;
begin
  select * into c from public.meow_cats where id = p_cat_id;
  select id into tid from public.meow_threads where cat_id = p_cat_id and member_id = auth.uid();
  if tid is not null then
    update public.meow_threads set homed_at = null, is_adopter = false
     where id = tid and homed_at is not null and household_id = c.household_id and c.status = 'adoptable';
    return tid;
  end if;
  if auth.uid() is null or public.meow_is_suspended(auth.uid()) then
    raise exception 'message_suspended' using errcode = 'P0001', hint = '目前無法傳送訊息';
  end if;
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
  -- 婉拒後、或貓退養回來後重新送出問卷，視為新的申請
  update public.meow_threads set declined_at = null, homed_at = null, is_adopter = false, member_read_at = now() where id = tid;
  perform public.meow_thread_event(tid, who || ' 送出了領養問卷。');
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (owner, 'adoption_response', '有人想領養「' || c.name || '」',
          who || ' 填好了「' || c.name || '」的領養問卷。', '/me/adoptions?t=' || tid);
  return new;
end $$;

-- 婉拒與恢復：找到家的串不能再婉拒或恢復（取代 0011 的同名函式，其餘不變）
create or replace function public.meow_decline_thread(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_threads;
begin
  select * into t from public.meow_threads where id = p_thread_id for update;
  if t.id is null or auth.uid() is null or public.meow_thread_keeper(p_thread_id) is distinct from auth.uid() then
    raise exception 'thread_not_keeper' using errcode = 'P0001', hint = '只有喵戶長能婉拒';
  end if;
  if t.homed_at is not null then
    raise exception 'thread_homed' using errcode = 'P0001', hint = '這隻貓已經找到家了';
  end if;
  if t.declined_at is not null then return; end if;
  -- 同一個交易裡 now() 不變，所以「已讀時間＝最後訊息時間」，自己的動作不會算成未讀
  update public.meow_threads set declined_at = now(), keeper_read_at = now() where id = t.id;
  perform public.meow_thread_event(t.id, '中途婉拒了這次的申請。');
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (t.member_id, 'adoption_status', '「' || t.cat_name || '」的領養申請有新進度',
          '這次沒有媒合成功，謝謝你願意給貓一個家。', '/me/adoptions?t=' || t.id);
end $$;

-- 通知連結：申請方和審核方共用「領養管理」一頁（#128）。0011 寫的 /me/applications 由頁面轉址，這裡改新寫入的連結。
create or replace function public.meow_send_message(p_thread_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.meow_threads; keeper uuid; me text; txt text := trim(coalesce(p_body, '')); mid uuid; other uuid; title text;
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
    other := keeper; title := t.member_name || ' 傳了新訊息';
  else
    update public.meow_threads set last_message_at = now(), keeper_text_at = now(), keeper_read_at = now() where id = t.id;
    other := t.member_id; title := '「' || t.household_name || '」傳了新訊息';
  end if;
  perform public.meow_notify_message(other, title, '關於「' || t.cat_name || '」：' || left(txt, 60), '/me/adoptions?t=' || t.id);
  return mid;
end $$;

-- 既有資料：已經移轉過的貓（有原中途喵戶）補上送養追蹤
do $$
declare c record;
begin
  for c in select cat.id, cat.origin_household_id, h.owner_id as adopter, cat.updated_at
             from public.meow_cats cat join public.meow_households h on h.id = cat.household_id
            where cat.origin_household_id is not null loop
    perform public.meow_mark_cat_homed(c.id, c.origin_household_id, c.adopter, c.updated_at);
  end loop;
end $$;

revoke all on function public.meow_mark_cat_homed(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
