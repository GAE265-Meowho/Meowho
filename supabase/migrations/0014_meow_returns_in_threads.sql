-- 0014 退養接到領養管理（#128 追加）：退養請求、撤回、收回／不用退養都在領養人和原中途的對話串裡進行。
-- 提出時把原因當成領養人的訊息留在對話串，通知連到那一串；中途在對話框處理，結果也留在對話裡。
-- 取代 0009 的三個退養函式（參數不變）。可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。

alter table public.meow_cat_returns add column if not exists thread_id uuid references public.meow_threads (id) on delete set null;

-- 找到或建立（貓, 領養人）和原中途的對話串；領養人就是原中途的喵戶長時（自己測試）不建立
create or replace function public.meow_return_thread(p_cat_id uuid, p_member uuid, p_origin uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid; c public.meow_cats; h public.meow_households;
begin
  select id into tid from public.meow_threads where cat_id = p_cat_id and member_id = p_member;
  if tid is not null then return tid; end if;
  select * into c from public.meow_cats where id = p_cat_id;
  select * into h from public.meow_households where id = p_origin;
  if c.id is null or h.id is null or h.owner_id = p_member then return null; end if;
  insert into public.meow_threads (cat_id, member_id, household_id, cat_name, household_name, member_name, homed_at, is_adopter, member_read_at)
  values (c.id, p_member, h.id, c.name, h.name,
          coalesce((select nullif(trim(display_name), '') from public.meow_profiles where id = p_member), '會員'), now(), true, now())
  on conflict (cat_id, member_id) do nothing
  returning id into tid;
  return coalesce(tid, (select id from public.meow_threads where cat_id = p_cat_id and member_id = p_member));
end $$;

create or replace function public.meow_request_cat_return(p_cat_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; h public.meow_households; origin_owner uuid; rid uuid; tid uuid; txt text := trim(coalesce(p_reason, ''));
begin
  select * into c from public.meow_cats where id = p_cat_id for update;
  select * into h from public.meow_households where id = c.household_id;
  if c.id is null or h.owner_id is distinct from auth.uid() then
    raise exception 'return_not_owner' using errcode = 'P0001', hint = '只有目前的飼主能提出退養請求';
  end if;
  select owner_id into origin_owner from public.meow_households where id = c.origin_household_id;
  if origin_owner is null then
    raise exception 'return_no_origin' using errcode = 'P0001', hint = '這隻貓沒有原中途，無法退養';
  end if;
  if txt = '' then
    raise exception 'return_reason_required' using errcode = 'P0001', hint = '請說明退養原因';
  end if;
  tid := public.meow_return_thread(c.id, auth.uid(), c.origin_household_id);
  insert into public.meow_cat_returns (cat_id, cat_name, requester_id, from_household_id, from_household_name, origin_household_id, reason, thread_id)
  values (c.id, c.name, auth.uid(), h.id, h.name, c.origin_household_id, txt, tid)
  returning id into rid;
  if tid is not null then
    -- 系統事件在前、原因（領養人的訊息）在後
    insert into public.meow_messages (thread_id, kind, body, created_at) values (tid, 'system', '提出了「' || c.name || '」的退養請求。', clock_timestamp());
    insert into public.meow_messages (thread_id, sender_id, kind, body, created_at) values (tid, auth.uid(), 'text', left(txt, 1000), clock_timestamp());
    update public.meow_threads set last_message_at = clock_timestamp(), member_text_at = clock_timestamp(), member_read_at = clock_timestamp() where id = tid;
  end if;
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (origin_owner, 'cat_return_request', '「' || h.name || '」想把「' || c.name || '」退回給你',
          '原因：' || left(txt, 80) || case when char_length(txt) > 80 then '…' else '' end,
          coalesce('/me/adoptions?t=' || tid, '/me/adoptions'));
  return rid;
end $$;

create or replace function public.meow_withdraw_cat_return(p_return_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.meow_cat_returns;
begin
  update public.meow_cat_returns set status = 'withdrawn', resolved_at = now()
   where id = p_return_id and requester_id = auth.uid() and status = 'pending'
  returning * into r;
  if r.id is null then
    raise exception 'return_not_pending' using errcode = 'P0001', hint = '找不到處理中的退養請求';
  end if;
  if r.thread_id is not null then
    perform public.meow_thread_event(r.thread_id, '撤回了退養請求。');
    update public.meow_threads set member_read_at = now() where id = r.thread_id;
  end if;
end $$;

-- 收回或不用退養：只有原中途的喵戶長。收回時貓回到原中途喵戶、改回待領養、時間軸加一筆；問卷維持暫停
create or replace function public.meow_resolve_cat_return(p_return_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.meow_cat_returns; c public.meow_cats; cat_name text;
begin
  select * into r from public.meow_cat_returns where id = p_return_id for update;
  if r.id is null or r.status <> 'pending'
     or not exists (select 1 from public.meow_households where id = r.origin_household_id and owner_id = auth.uid()) then
    raise exception 'return_not_pending' using errcode = 'P0001', hint = '找不到你可以處理的退養請求';
  end if;
  select * into c from public.meow_cats where id = r.cat_id for update;
  cat_name := c.name;
  if p_accept then
    perform set_config('meow.cat_flow', 'on', true);
    update public.meow_cats
       set household_id = r.origin_household_id,
           status = 'adoptable',
           origin_household_id = null,
           timeline = (
             select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
               from jsonb_array_elements(c.timeline) with ordinality as t(e, n)
              where n > greatest(jsonb_array_length(c.timeline) - 49, 0)
           ) || jsonb_build_array(jsonb_build_object('date', to_char(current_date, 'YYYY-MM-DD'), 'event', '退養回到中途')),
           updated_at = now()
     where id = r.cat_id;
    perform set_config('meow.cat_flow', '', true);
  end if;
  update public.meow_cat_returns set status = case when p_accept then 'returned' else 'declined' end, resolved_at = now()
   where id = r.id;
  if r.thread_id is not null then
    perform public.meow_thread_event(r.thread_id,
      case when p_accept then '中途收回了「' || cat_name || '」，牠回到中途重新等家。' else '中途認為不需要退養。' end);
    update public.meow_threads set keeper_read_at = now() where id = r.thread_id;
  end if;
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (r.requester_id, 'cat_return_result',
          case when p_accept then '中途已收回「' || cat_name || '」' else '中途婉拒了退養請求' end,
          case when p_accept then '謝謝你這段時間的照顧。' else '中途認為不需要退養，有問題可以再和中途聊聊。' end,
          coalesce('/me/adoptions?t=' || r.thread_id, '/me/adoptions'));
end $$;

-- 既有的退養請求接上對話串（處理中的補一則系統事件與原因）
do $$
declare r record; tid uuid;
begin
  for r in select * from public.meow_cat_returns where thread_id is null loop
    tid := public.meow_return_thread(r.cat_id, r.requester_id, r.origin_household_id);
    if tid is null then continue; end if;
    update public.meow_cat_returns set thread_id = tid where id = r.id;
    if r.status = 'pending' then
      insert into public.meow_messages (thread_id, kind, body, created_at) values (tid, 'system', '提出了「' || r.cat_name || '」的退養請求。', r.created_at);
      insert into public.meow_messages (thread_id, sender_id, kind, body, created_at) values (tid, r.requester_id, 'text', left(r.reason, 1000), r.created_at + interval '1 millisecond');
      update public.meow_threads set last_message_at = greatest(last_message_at, r.created_at + interval '1 millisecond'),
             member_text_at = greatest(coalesce(member_text_at, '-infinity'), r.created_at) where id = tid;
    end if;
  end loop;
end $$;

revoke all on function public.meow_return_thread(uuid, uuid, uuid) from public, anon, authenticated;
