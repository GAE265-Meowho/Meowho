-- 0021｜MeowHQ 生活用品（Issue #197，Tina 2026-11-04 確認後執行）
-- 新增類別、用品與公開 bucket。不修改任何既有資料表。可重複執行。

create table if not exists public.meow_item_categories (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint meow_item_categories_name_key unique (name)
);

create table if not exists public.meow_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  name_en text check (name_en is null or char_length(btrim(name_en)) between 1 and 80),
  category_id text not null references public.meow_item_categories (id) on delete restrict,
  price_twd int check (price_twd is null or price_twd >= 0),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  model_path text not null check (model_path ~* '\.glb$'),
  width_m numeric(8,3) check (width_m is null or width_m > 0),
  depth_m numeric(8,3) check (depth_m is null or depth_m > 0),
  height_m numeric(8,3) check (height_m is null or height_m > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meow_items_category_idx on public.meow_items (category_id, name);

insert into public.meow_item_categories (id, name, sort_order) values
  ('litter_box', '貓砂盆', 1),
  ('bowls', '餐碗水碗', 2),
  ('toys', '玩具', 3),
  ('scratchers', '貓抓板', 4)
on conflict (id) do nothing;

alter table public.meow_item_categories enable row level security;
alter table public.meow_items enable row level security;
revoke all on public.meow_item_categories from anon, authenticated;
revoke all on public.meow_items from anon, authenticated;
grant select on public.meow_item_categories to anon, authenticated;
grant select on public.meow_items to anon, authenticated;
grant insert, update, delete on public.meow_item_categories to authenticated;
grant insert, update, delete on public.meow_items to authenticated;

drop policy if exists "meow_item_categories: read" on public.meow_item_categories;
create policy "meow_item_categories: read" on public.meow_item_categories
  for select to anon, authenticated using (true);
drop policy if exists "meow_item_categories: insert virtual_assets" on public.meow_item_categories;
create policy "meow_item_categories: insert virtual_assets" on public.meow_item_categories
  for insert to authenticated with check ((select public.meow_has_module('virtual_assets')));
drop policy if exists "meow_item_categories: update virtual_assets" on public.meow_item_categories;
create policy "meow_item_categories: update virtual_assets" on public.meow_item_categories
  for update to authenticated
  using ((select public.meow_has_module('virtual_assets')))
  with check ((select public.meow_has_module('virtual_assets')));
drop policy if exists "meow_item_categories: delete virtual_assets" on public.meow_item_categories;
create policy "meow_item_categories: delete virtual_assets" on public.meow_item_categories
  for delete to authenticated using ((select public.meow_has_module('virtual_assets')));

drop policy if exists "meow_items: read" on public.meow_items;
create policy "meow_items: read" on public.meow_items
  for select to anon, authenticated using (true);
drop policy if exists "meow_items: insert virtual_assets" on public.meow_items;
create policy "meow_items: insert virtual_assets" on public.meow_items
  for insert to authenticated with check ((select public.meow_has_module('virtual_assets')));
drop policy if exists "meow_items: update virtual_assets" on public.meow_items;
create policy "meow_items: update virtual_assets" on public.meow_items
  for update to authenticated
  using ((select public.meow_has_module('virtual_assets')))
  with check ((select public.meow_has_module('virtual_assets')));
drop policy if exists "meow_items: delete virtual_assets" on public.meow_items;
create policy "meow_items: delete virtual_assets" on public.meow_items
  for delete to authenticated using ((select public.meow_has_module('virtual_assets')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meow-items', 'meow-items', true, 20971520,
  array['model/gltf-binary', 'application/octet-stream']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meow: items public read" on storage.objects;
create policy "meow: items public read" on storage.objects for select
  using (bucket_id = 'meow-items');
drop policy if exists "meow: items insert virtual_assets" on storage.objects;
create policy "meow: items insert virtual_assets" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meow-items'
    and lower(storage.extension(name)) = 'glb'
    and (select public.meow_has_module('virtual_assets'))
  );
drop policy if exists "meow: items update virtual_assets" on storage.objects;
create policy "meow: items update virtual_assets" on storage.objects for update to authenticated
  using (bucket_id = 'meow-items' and (select public.meow_has_module('virtual_assets')))
  with check (
    bucket_id = 'meow-items'
    and lower(storage.extension(name)) = 'glb'
    and (select public.meow_has_module('virtual_assets'))
  );
drop policy if exists "meow: items delete virtual_assets" on storage.objects;
create policy "meow: items delete virtual_assets" on storage.objects for delete to authenticated
  using (bucket_id = 'meow-items' and (select public.meow_has_module('virtual_assets')));
