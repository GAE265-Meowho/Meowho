-- 0025 一般飼主的每月養貓預算（#233、#237）：建立喵戶時先填，試養遊戲用來分析預算夠不夠、給建議。
-- 不放在 meow_households.home：公開的喵戶整筆讀得到，預算只給喵戶長自己（和後台喵戶模組）看。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。
create table if not exists public.meow_household_budgets (
  household_id uuid primary key references public.meow_households (id) on delete cascade,
  monthly_twd int not null check (monthly_twd between 1 and 200000),
  updated_at timestamptz not null default now()
);

alter table public.meow_household_budgets enable row level security;
revoke all on public.meow_household_budgets from anon, authenticated;
grant select, insert, update, delete on public.meow_household_budgets to authenticated;

-- 只有一般飼主的喵戶能存預算，而且只有喵戶長本人
create or replace function public.meow_owns_cat_owner_household(p_household uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meow_households h
    where h.id = p_household and h.owner_id = auth.uid() and h.caretaker_type = 'cat_owner');
$$;
revoke all on function public.meow_owns_cat_owner_household(uuid) from public;
grant execute on function public.meow_owns_cat_owner_household(uuid) to authenticated;

drop policy if exists "meow_household_budgets: read own" on public.meow_household_budgets;
create policy "meow_household_budgets: read own" on public.meow_household_budgets for select to authenticated
  using ((select public.meow_owns_cat_owner_household(household_id)));
drop policy if exists "meow_household_budgets: read by households module" on public.meow_household_budgets;
create policy "meow_household_budgets: read by households module" on public.meow_household_budgets for select to authenticated
  using ((select public.meow_has_module('households')));
drop policy if exists "meow_household_budgets: insert own" on public.meow_household_budgets;
create policy "meow_household_budgets: insert own" on public.meow_household_budgets for insert to authenticated
  with check ((select public.meow_owns_cat_owner_household(household_id)));
drop policy if exists "meow_household_budgets: update own" on public.meow_household_budgets;
create policy "meow_household_budgets: update own" on public.meow_household_budgets for update to authenticated
  using ((select public.meow_owns_cat_owner_household(household_id)))
  with check ((select public.meow_owns_cat_owner_household(household_id)));
drop policy if exists "meow_household_budgets: delete own" on public.meow_household_budgets;
create policy "meow_household_budgets: delete own" on public.meow_household_budgets for delete to authenticated
  using ((select public.meow_owns_cat_owner_household(household_id)));
