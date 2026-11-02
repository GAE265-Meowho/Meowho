-- #104：同一隻貓保存成貓與幼貓各自的貼圖。執行前須經 Tina 確認。
create table if not exists public.meow_cat_model_variants (
  model_id text not null references public.meow_cat_models(id) on delete cascade,
  body_type text not null check (body_type in ('adult', 'kitten')),
  albedo_path text,
  prev_albedo_path text,
  base_version text,
  prev_base_version text,
  confirmed_albedo text,
  updated_at timestamptz not null default now(),
  primary key (model_id, body_type)
);

alter table public.meow_cat_model_jobs add column if not exists body_type text;
alter table public.meow_cat_model_jobs drop constraint if exists meow_cat_model_jobs_body_type_check;
alter table public.meow_cat_model_jobs add constraint meow_cat_model_jobs_body_type_check
  check (body_type is null or body_type in ('adult', 'kitten'));

-- 舊目前版先搬到其母體。無版本或 v1 為成貓，不能由年齡誤判。
insert into public.meow_cat_model_variants (model_id, body_type, albedo_path, base_version, confirmed_albedo)
select id, case when base_version like 'kitten%' then 'kitten' else 'adult' end,
       albedo_path, base_version,
       case when not (profile ? 'confirmed_albedo') or profile->>'confirmed_albedo' = albedo_path then albedo_path else null end
from public.meow_cat_models where albedo_path is not null
on conflict (model_id, body_type) do nothing;

-- 舊上一版若屬同體型，仍是上一版；不同體型則成為另一體型的目前版。
update public.meow_cat_model_variants v
set prev_albedo_path = m.prev_albedo_path, prev_base_version = m.meta->>'prev_base_version',
    confirmed_albedo = case when m.profile->>'confirmed_albedo' = m.prev_albedo_path then m.prev_albedo_path else v.confirmed_albedo end
from public.meow_cat_models m
where v.model_id = m.id and m.prev_albedo_path is not null and v.prev_albedo_path is null
  and v.body_type = case when m.base_version like 'kitten%' then 'kitten' else 'adult' end
  and v.body_type = case when m.meta->>'prev_base_version' like 'kitten%' then 'kitten' else 'adult' end;

insert into public.meow_cat_model_variants (model_id, body_type, albedo_path, base_version, confirmed_albedo)
select m.id, case when m.meta->>'prev_base_version' like 'kitten%' then 'kitten' else 'adult' end,
       m.prev_albedo_path, m.meta->>'prev_base_version',
       case when m.profile->>'confirmed_albedo' = m.prev_albedo_path then m.prev_albedo_path else null end
from public.meow_cat_models m
where m.prev_albedo_path is not null
  and (case when m.base_version like 'kitten%' then 'kitten' else 'adult' end)
      <> (case when m.meta->>'prev_base_version' like 'kitten%' then 'kitten' else 'adult' end)
on conflict (model_id, body_type) do nothing;

alter table public.meow_cat_model_variants enable row level security;
revoke all on public.meow_cat_model_variants from anon, authenticated;
grant select, insert, update, delete on public.meow_cat_model_variants to authenticated;

drop policy if exists "meow_cat_model_variants: read" on public.meow_cat_model_variants;
create policy "meow_cat_model_variants: read" on public.meow_cat_model_variants for select to authenticated using (
  exists (select 1 from public.meow_cat_models m where m.id = model_id and (
    m.status = 'published' or (select public.meow_has_module('virtual_assets'))
    or (m.owner_type = 'member' and m.owner_id = auth.uid())
  ))
);
drop policy if exists "meow_cat_model_variants: write virtual_assets" on public.meow_cat_model_variants;
create policy "meow_cat_model_variants: write virtual_assets" on public.meow_cat_model_variants
  for all to authenticated using ((select public.meow_has_module('virtual_assets')))
  with check ((select public.meow_has_module('virtual_assets')));
