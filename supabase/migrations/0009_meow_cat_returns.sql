-- 0009 建立貓咪重新盤點（#109）：年齡層改三級、貓的狀態只能走流程改變、退養請求。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。

-- =========================================================
-- 年齡層：幼貓／壯貓／老貓三級，直接等於 3D 體型（#59）
-- =========================================================
alter table public.meow_cats drop constraint if exists meow_cats_life_stage_check;
update public.meow_cats set life_stage = 'adult' where life_stage in ('young_adult', 'mature_adult');
alter table public.meow_cats add constraint meow_cats_life_stage_check
  check (life_stage is null or life_stage in ('kitten', 'adult', 'senior'));

-- 新增的貓預設是待領養（只有中途能新增）
alter table public.meow_cats alter column status set default 'adoptable';

-- =========================================================
-- 原中途喵戶：移轉時寫入，退養收回時貓回到這裡
-- =========================================================
alter table public.meow_cats add column if not exists origin_household_id uuid
  references public.meow_households (id) on delete set null;

-- 移轉、退養的資料庫函式執行時才打開；喵戶長直接改會被下面的 trigger 擋下
create or replace function public.meow_in_cat_flow()
returns boolean language sql stable as $$
  select coalesce(current_setting('meow.cat_flow', true), '') = 'on'
$$;

-- 新增貓：只有中途的喵戶能新增，而且一律是待領養
create or replace function public.meow_cat_insert_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.meow_in_cat_flow() or auth.uid() is null then return new; end if;
  if (select caretaker_type from public.meow_households where id = new.household_id) = 'cat_owner' then
    raise exception 'cat_owner_cannot_add_cat' using errcode = 'P0001', hint = '一般飼主的喵戶不能新增貓咪';
  end if;
  if new.status <> 'adoptable' or new.origin_household_id is not null then
    raise exception 'cat_status_flow_only' using errcode = 'P0001', hint = '新增的貓一律是待領養';
  end if;
  return new;
end $$;
drop trigger if exists meow_cats_insert_guard on public.meow_cats;
create trigger meow_cats_insert_guard before insert on public.meow_cats
  for each row execute function public.meow_cat_insert_guard();

-- 修改貓：狀態、所屬喵戶、原中途喵戶只能由流程改變
-- 例外：原中途喵戶被刪除時，外鍵把 origin_household_id 設成 null
create or replace function public.meow_cat_update_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.meow_in_cat_flow() or auth.uid() is null then return new; end if;
  if new.status is distinct from old.status or new.household_id is distinct from old.household_id then
    raise exception 'cat_status_flow_only' using errcode = 'P0001', hint = '貓的狀態只能透過移轉或退養改變';
  end if;
  if new.origin_household_id is distinct from old.origin_household_id
     and not (new.origin_household_id is null
              and not exists (select 1 from public.meow_households where id = old.origin_household_id)) then
    raise exception 'cat_status_flow_only' using errcode = 'P0001', hint = '原中途喵戶只能由移轉寫入';
  end if;
  return new;
end $$;
drop trigger if exists meow_cats_update_guard on public.meow_cats;
create trigger meow_cats_update_guard before update on public.meow_cats
  for each row execute function public.meow_cat_update_guard();

-- 刪除貓：從中途領養來的貓不能自己刪，要先提出退養請求
create or replace function public.meow_cat_delete_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.meow_in_cat_flow() or auth.uid() is null then return old; end if;
  if old.origin_household_id is not null
     and exists (select 1 from public.meow_households where id = old.origin_household_id) then
    raise exception 'cat_has_origin' using errcode = 'P0001', hint = '從中途領養來的貓，請先向原中途提出退養請求';
  end if;
  return old;
end $$;
drop trigger if exists meow_cats_delete_guard on public.meow_cats;
create trigger meow_cats_delete_guard before delete on public.meow_cats
  for each row execute function public.meow_cat_delete_guard();

-- =========================================================
-- 退養請求：一般飼主提出 → 原中途收回或婉拒；飼主可以在處理前撤回
-- =========================================================
create table if not exists public.meow_cat_returns (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references public.meow_cats (id) on delete cascade,
  cat_name text not null,
  requester_id uuid not null references public.meow_profiles (id) on delete cascade,
  from_household_id uuid references public.meow_households (id) on delete set null,
  from_household_name text not null,
  origin_household_id uuid not null references public.meow_households (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'returned', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists meow_cat_returns_one_pending on public.meow_cat_returns (cat_id) where status = 'pending';
create index if not exists meow_cat_returns_origin_idx on public.meow_cat_returns (origin_household_id, created_at desc);

alter table public.meow_cat_returns enable row level security;

-- 提出的飼主、原中途的喵戶長看得到；寫入一律走下面的函式
-- 貓名、飼主喵戶名存一份：貓在飼主的私人喵戶時，原中途讀不到貓本身
drop policy if exists "meow_cat_returns: read" on public.meow_cat_returns;
create policy "meow_cat_returns: read" on public.meow_cat_returns for select using (
  requester_id = auth.uid()
  or exists (select 1 from public.meow_households h where h.id = meow_cat_returns.origin_household_id and h.owner_id = auth.uid())
);

-- 提出退養請求：只有貓目前所屬喵戶的擁有者，而且貓有原中途
create or replace function public.meow_request_cat_return(p_cat_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; h public.meow_households; origin_owner uuid; rid uuid;
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
  if char_length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'return_reason_required' using errcode = 'P0001', hint = '請說明退養原因';
  end if;
  insert into public.meow_cat_returns (cat_id, cat_name, requester_id, from_household_id, from_household_name, origin_household_id, reason)
  values (c.id, c.name, auth.uid(), h.id, h.name, c.origin_household_id, trim(p_reason))
  returning id into rid;
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (origin_owner, 'cat_return_request', '有人提出退養請求',
          '「' || h.name || '」想把「' || c.name || '」退回給你，請先和飼主聊聊。', '/me');
  return rid;
end $$;

-- 撤回：只有提出的飼主，而且還在處理中
create or replace function public.meow_withdraw_cat_return(p_return_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.meow_cat_returns set status = 'withdrawn', resolved_at = now()
   where id = p_return_id and requester_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'return_not_pending' using errcode = 'P0001', hint = '找不到處理中的退養請求';
  end if;
end $$;

-- 收回或婉拒：只有原中途的喵戶長。收回時貓回到原中途喵戶、改回待領養、時間軸加一筆；問卷維持暫停
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
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (r.requester_id, 'cat_return_result',
          case when p_accept then '中途已收回「' || cat_name || '」' else '中途婉拒了退養請求' end,
          case when p_accept then '謝謝你這段時間的照顧。' else '中途認為不需要退養，有問題可以再和中途聊聊。' end, '/me');
end $$;

revoke all on function public.meow_request_cat_return(uuid, text) from public;
revoke all on function public.meow_withdraw_cat_return(uuid) from public;
revoke all on function public.meow_resolve_cat_return(uuid, boolean) from public;
grant execute on function public.meow_request_cat_return(uuid, text) to authenticated;
grant execute on function public.meow_withdraw_cat_return(uuid) to authenticated;
grant execute on function public.meow_resolve_cat_return(uuid, boolean) to authenticated;
