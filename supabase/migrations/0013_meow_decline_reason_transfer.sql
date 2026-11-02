-- 0013 婉拒理由與移轉（#128 追加）
-- 婉拒：中途一定要寫理由（畫面先由 AI 擬草稿），理由以中途的訊息留在對話串，領養人的通知也附上理由。
-- 移轉（GLOSSARY「移轉」「轉入喵戶」）：中途在對話框提出 → 領養人確認接收並選轉入喵戶（沒有就自動建立）→ 貓搬家。
--   中途提出時要再輸入一次貓名確認（防呆）；領養人確認前中途可以取消，領養人也可以先不要。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。
-- 錯誤代碼：decline_reason_required、decline_reason_too_long、transfer_not_ready、transfer_confirm_mismatch、
--   transfer_pending、transfer_not_pending、transfer_bad_household。

-- =========================================================
-- 婉拒要附理由：取代 0012 的一個參數版本
-- =========================================================
drop function if exists public.meow_decline_thread(uuid);
create or replace function public.meow_decline_thread(p_thread_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_threads; txt text := trim(coalesce(p_reason, ''));
begin
  select * into t from public.meow_threads where id = p_thread_id for update;
  if t.id is null or auth.uid() is null or public.meow_thread_keeper(p_thread_id) is distinct from auth.uid() then
    raise exception 'thread_not_keeper' using errcode = 'P0001', hint = '只有喵戶長能婉拒';
  end if;
  if t.homed_at is not null then
    raise exception 'thread_homed' using errcode = 'P0001', hint = '這隻貓已經找到家了';
  end if;
  if t.declined_at is not null then return; end if;
  if txt = '' then raise exception 'decline_reason_required' using errcode = 'P0001', hint = '請填寫婉拒理由'; end if;
  if char_length(txt) > 500 then raise exception 'decline_reason_too_long' using errcode = 'P0001', hint = '婉拒理由最多 500 字'; end if;
  -- 系統事件在前、理由（中途的訊息）在後；同一個交易裡 now() 不變，用 clock_timestamp() 讓順序固定
  insert into public.meow_messages (thread_id, kind, body, created_at) values (t.id, 'system', '中途婉拒了這次的申請。', clock_timestamp());
  insert into public.meow_messages (thread_id, sender_id, kind, body, created_at) values (t.id, auth.uid(), 'text', txt, clock_timestamp());
  update public.meow_threads set declined_at = now(), last_message_at = clock_timestamp(), keeper_text_at = clock_timestamp(),
         keeper_read_at = clock_timestamp() where id = t.id;
  -- 移轉還在等確認時一併取消
  update public.meow_cat_transfers set status = 'cancelled', resolved_at = now() where thread_id = t.id and status = 'pending';
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (t.member_id, 'adoption_status', '「' || t.cat_name || '」的領養申請有新進度',
          '這次沒有媒合成功。中途的說明：' || left(txt, 80) || case when char_length(txt) > 80 then '…' else '' end,
          '/me/adoptions?t=' || t.id);
end $$;

-- =========================================================
-- 移轉
-- =========================================================
create table if not exists public.meow_cat_transfers (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.meow_threads (id) on delete cascade,
  cat_id uuid not null references public.meow_cats (id) on delete cascade,
  from_household_id uuid not null references public.meow_households (id) on delete cascade,
  to_member_id uuid not null references public.meow_profiles (id) on delete cascade,
  to_household_id uuid references public.meow_households (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists meow_cat_transfers_one_pending on public.meow_cat_transfers (cat_id) where status = 'pending';
create index if not exists meow_cat_transfers_thread_idx on public.meow_cat_transfers (thread_id, created_at desc);

alter table public.meow_cat_transfers enable row level security;
drop policy if exists "meow_cat_transfers: read" on public.meow_cat_transfers;
create policy "meow_cat_transfers: read" on public.meow_cat_transfers for select using (
  to_member_id = auth.uid()
  or exists (select 1 from public.meow_households h where h.id = meow_cat_transfers.from_household_id and h.owner_id = auth.uid())
);
revoke insert, update, delete on public.meow_cat_transfers from anon, authenticated;

-- 中途提出：要再輸入一次貓名
create or replace function public.meow_offer_transfer(p_thread_id uuid, p_confirm_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.meow_threads; c public.meow_cats; tid uuid;
begin
  select * into t from public.meow_threads where id = p_thread_id for update;
  if t.id is null or auth.uid() is null or public.meow_thread_keeper(p_thread_id) is distinct from auth.uid() then
    raise exception 'thread_not_keeper' using errcode = 'P0001', hint = '只有喵戶長能移轉';
  end if;
  select * into c from public.meow_cats where id = t.cat_id for update;
  if c.id is null or c.household_id <> t.household_id or c.status <> 'adoptable' or t.declined_at is not null or t.homed_at is not null then
    raise exception 'transfer_not_ready' using errcode = 'P0001', hint = '這隻貓目前不能移轉給這位申請人';
  end if;
  if trim(coalesce(p_confirm_name, '')) <> c.name then
    raise exception 'transfer_confirm_mismatch' using errcode = 'P0001', hint = '輸入的貓名不一樣';
  end if;
  if public.meow_is_suspended(t.member_id) or public.meow_is_blocked(t.member_id, auth.uid()) then
    raise exception 'transfer_not_ready' using errcode = 'P0001', hint = '目前無法移轉給這位申請人';
  end if;
  if exists (select 1 from public.meow_cat_transfers where cat_id = c.id and status = 'pending') then
    raise exception 'transfer_pending' using errcode = 'P0001', hint = '這隻貓已經有一筆等待確認的移轉';
  end if;
  insert into public.meow_cat_transfers (thread_id, cat_id, from_household_id, to_member_id)
  values (t.id, c.id, t.household_id, t.member_id) returning id into tid;
  perform public.meow_thread_event(t.id, '中途想把「' || c.name || '」交給 ' || t.member_name || '，等待確認接收。');
  update public.meow_threads set keeper_read_at = now() where id = t.id;
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (t.member_id, 'cat_transfer', '中途想把「' || c.name || '」交給你',
          '請到領養管理確認接收，並選擇「' || c.name || '」要住進哪個喵戶。', '/me/adoptions?t=' || t.id);
  return tid;
end $$;

create or replace function public.meow_cancel_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.meow_cat_transfers;
begin
  select * into r from public.meow_cat_transfers where id = p_transfer_id for update;
  if r.id is null or r.status <> 'pending'
     or not exists (select 1 from public.meow_households where id = r.from_household_id and owner_id = auth.uid()) then
    raise exception 'transfer_not_pending' using errcode = 'P0001', hint = '找不到等待確認的移轉';
  end if;
  update public.meow_cat_transfers set status = 'cancelled', resolved_at = now() where id = r.id;
  perform public.meow_thread_event(r.thread_id, '中途取消了這次的移轉。');
  update public.meow_threads set keeper_read_at = now() where id = r.thread_id;
end $$;

create or replace function public.meow_decline_transfer(p_transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.meow_cat_transfers; t public.meow_threads;
begin
  select * into r from public.meow_cat_transfers where id = p_transfer_id for update;
  if r.id is null or r.status <> 'pending' or r.to_member_id is distinct from auth.uid() then
    raise exception 'transfer_not_pending' using errcode = 'P0001', hint = '找不到等待確認的移轉';
  end if;
  select * into t from public.meow_threads where id = r.thread_id;
  update public.meow_cat_transfers set status = 'declined', resolved_at = now() where id = r.id;
  perform public.meow_thread_event(r.thread_id, t.member_name || ' 這次先不接收。');
  update public.meow_threads set member_read_at = now() where id = r.thread_id;
  insert into public.meow_notifications (user_id, type, title, body, link)
  select h.owner_id, 'cat_transfer', t.member_name || ' 這次先不接收「' || t.cat_name || '」', '可以在領養管理和對方聊聊。', '/me/adoptions?t=' || t.id
    from public.meow_households h where h.id = r.from_household_id;
end $$;

-- 領養人確認接收：p_household_id＝自己的一般飼主喵戶；null＝自動建立一個
create or replace function public.meow_accept_transfer(p_transfer_id uuid, p_household_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.meow_cat_transfers; c public.meow_cats; t public.meow_threads; src public.meow_households; dest uuid; who text;
begin
  select * into r from public.meow_cat_transfers where id = p_transfer_id for update;
  if r.id is null or r.status <> 'pending' or r.to_member_id is distinct from auth.uid() then
    raise exception 'transfer_not_pending' using errcode = 'P0001', hint = '找不到等待確認的移轉';
  end if;
  select * into c from public.meow_cats where id = r.cat_id for update;
  if c.household_id <> r.from_household_id or c.status <> 'adoptable' then
    raise exception 'transfer_not_ready' using errcode = 'P0001', hint = '這隻貓目前不能移轉';
  end if;
  select * into t from public.meow_threads where id = r.thread_id;
  select * into src from public.meow_households where id = r.from_household_id;
  if p_household_id is null then
    -- 轉入喵戶：領養人沒有時自動建立（名稱、地區之後可以在喵戶設定修改；地區先沿用中途所在的縣市區）
    who := coalesce((select nullif(trim(display_name), '') from public.meow_profiles where id = auth.uid()), '我');
    insert into public.meow_households (owner_id, name, caretaker_type, city, district, default_visibility)
    values (auth.uid(), left(who, 27) || '的家', 'cat_owner', src.city, src.district, 'private')
    returning id into dest;
  else
    select id into dest from public.meow_households where id = p_household_id and owner_id = auth.uid() and caretaker_type = 'cat_owner';
    if dest is null then
      raise exception 'transfer_bad_household' using errcode = 'P0001', hint = '請選擇你自己的一般飼主喵戶';
    end if;
  end if;

  update public.meow_cat_transfers set status = 'accepted', to_household_id = dest, resolved_at = now() where id = r.id;
  perform set_config('meow.cat_flow', 'on', true);
  update public.meow_cats
     set household_id = dest, status = 'own', origin_household_id = r.from_household_id,
         timeline = (
           select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
             from jsonb_array_elements(c.timeline) with ordinality as x(e, n)
            where n > greatest(jsonb_array_length(c.timeline) - 49, 0)
         ) || jsonb_build_array(jsonb_build_object('date', to_char(current_date, 'YYYY-MM-DD'), 'event', '領養到新家')),
         updated_at = now()
   where id = c.id;
  perform set_config('meow.cat_flow', '', true);
  -- 其他申請人的串由 0012 的移轉 trigger 自動婉拒並移到送養追蹤
  perform public.meow_thread_event(t.id, '「' || c.name || '」正式成為 ' || t.member_name || ' 的家人了。');
  update public.meow_threads set member_read_at = now() where id = t.id;
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (src.owner_id, 'cat_transfer', t.member_name || ' 接收了「' || c.name || '」', '移轉完成，可以在送養追蹤繼續關心牠的近況。', '/me/adoptions?t=' || t.id);
  return dest;
end $$;

revoke all on function public.meow_decline_thread(uuid, text) from public;
revoke all on function public.meow_offer_transfer(uuid, text) from public;
revoke all on function public.meow_cancel_transfer(uuid) from public;
revoke all on function public.meow_decline_transfer(uuid) from public;
revoke all on function public.meow_accept_transfer(uuid, uuid) from public;
grant execute on function public.meow_decline_thread(uuid, text) to authenticated;
grant execute on function public.meow_offer_transfer(uuid, text) to authenticated;
grant execute on function public.meow_cancel_transfer(uuid) to authenticated;
grant execute on function public.meow_decline_transfer(uuid) to authenticated;
grant execute on function public.meow_accept_transfer(uuid, uuid) to authenticated;
