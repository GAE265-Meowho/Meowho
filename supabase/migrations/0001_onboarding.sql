-- MeowHome 0001：會員、貓戶、貓咪、照片儲存（中途之家 onboarding）
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行一次即可。

-- ---------- 會員 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('member', 'admin')),
  terms_version text,
  terms_agreed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 新會員註冊時自動建立 profile（取 Google 名稱與頭像）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 貓戶（一個帳號最多 2 個貓戶，FR-02-01；每個貓戶可有很多貓） ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  caretaker_type text not null check (caretaker_type in ('personal_foster', 'shelter_org', 'cat_owner')),
  city text not null,
  district text not null,               -- 只存到區（FR-02-07）
  intro text not null default '',
  cat_count int check (cat_count is null or cat_count >= 0),
  allow_stranger_messages boolean not null default true,
  default_visibility text not null default 'public' check (default_visibility in ('public', 'private')),
  verified_shelter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists households_owner_idx on public.households (owner_id);

-- 每個帳號最多 2 個貓戶
create or replace function public.enforce_household_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.households where owner_id = new.owner_id) >= 2 then
    raise exception 'household_limit' using errcode = 'P0001', hint = '每個帳號最多建立 2 個貓戶';
  end if;
  return new;
end $$;

drop trigger if exists households_limit on public.households;
create trigger households_limit before insert on public.households
  for each row execute function public.enforce_household_limit();

-- ---------- 貓咪 ----------
create table if not exists public.cats (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  sex text not null check (sex in ('male', 'female', 'unknown')),
  birthday date,
  est_age_months int check (est_age_months is null or est_age_months >= 0),
  zodiac text,
  breed text,
  coat text,
  blood_type text not null default 'unknown' check (blood_type in ('A', 'B', 'AB', 'unknown')),
  neutered boolean,
  traits text[] not null default '{}',
  quirks text,
  notes text,
  photo_url text,
  visibility text check (visibility is null or visibility in ('public', 'private')),  -- null＝沿用貓戶預設
  status text not null default 'own' check (status in ('own', 'adoptable', 'adopted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cats_household_idx on public.cats (household_id);

-- ---------- 權限（RLS） ----------
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.cats enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = 'member');

drop policy if exists "households: read public or own" on public.households;
create policy "households: read public or own" on public.households for select
  using (default_visibility = 'public' or owner_id = auth.uid());
drop policy if exists "households: insert own" on public.households;
create policy "households: insert own" on public.households for insert with check (owner_id = auth.uid() and verified_shelter = false);
drop policy if exists "households: update own" on public.households;
create policy "households: update own" on public.households for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "households: delete own" on public.households;
create policy "households: delete own" on public.households for delete using (owner_id = auth.uid());

-- 貓咪可見：自己的貓、公開貓戶裡沒有設私密的貓、待領養的貓（強制公開，FR-02-06）
drop policy if exists "cats: read visible" on public.cats;
create policy "cats: read visible" on public.cats for select using (
  exists (
    select 1 from public.households h where h.id = cats.household_id
      and (h.owner_id = auth.uid() or cats.status = 'adoptable' or coalesce(cats.visibility, h.default_visibility) = 'public')
  )
);
drop policy if exists "cats: write own" on public.cats;
create policy "cats: write own" on public.cats for all
  using (exists (select 1 from public.households h where h.id = cats.household_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.households h where h.id = cats.household_id and h.owner_id = auth.uid()));

-- ---------- 照片儲存 ----------
insert into storage.buckets (id, name, public) values ('cat-photos', 'cat-photos', true)
  on conflict (id) do nothing;

drop policy if exists "cat-photos: upload own folder" on storage.objects;
create policy "cat-photos: upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'cat-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "cat-photos: manage own" on storage.objects;
create policy "cat-photos: manage own" on storage.objects for delete to authenticated
  using (bucket_id = 'cat-photos' and (storage.foldername(name))[1] = auth.uid()::text);
