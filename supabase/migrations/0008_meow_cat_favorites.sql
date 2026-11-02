-- 0008 收藏貓咪（#70）：會員在貓咪頁收藏有興趣的貓，在「我的收藏」查看。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。收藏是誰只有本人看得到；喵戶長只查得到數字。

create table if not exists public.meow_cat_favorites (
  user_id uuid not null references public.meow_profiles (id) on delete cascade,
  cat_id uuid not null references public.meow_cats (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, cat_id)
);
create index if not exists meow_cat_favorites_cat_idx on public.meow_cat_favorites (cat_id);

alter table public.meow_cat_favorites enable row level security;

drop policy if exists "meow_cat_favorites: read own" on public.meow_cat_favorites;
create policy "meow_cat_favorites: read own" on public.meow_cat_favorites for select using (user_id = auth.uid());
-- 只能收藏看得到的貓（meow_cats 的 RLS 決定看不看得到）
drop policy if exists "meow_cat_favorites: insert own" on public.meow_cat_favorites;
create policy "meow_cat_favorites: insert own" on public.meow_cat_favorites for insert with check (
  user_id = auth.uid() and exists (select 1 from public.meow_cats c where c.id = meow_cat_favorites.cat_id)
);
drop policy if exists "meow_cat_favorites: delete own" on public.meow_cat_favorites;
create policy "meow_cat_favorites: delete own" on public.meow_cat_favorites for delete using (user_id = auth.uid());

-- 收藏數：只有這隻貓的喵戶長查得到，其他人拿到 null
create or replace function public.meow_cat_favorite_count(p_cat_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.meow_cats c join public.meow_households h on h.id = c.household_id
                 where c.id = p_cat_id and h.owner_id = auth.uid())
    then (select count(*)::int from public.meow_cat_favorites where cat_id = p_cat_id)
  end
$$;
revoke all on function public.meow_cat_favorite_count(uuid) from public;
grant execute on function public.meow_cat_favorite_count(uuid) to authenticated;
