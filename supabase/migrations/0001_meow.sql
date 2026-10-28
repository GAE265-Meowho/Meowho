-- MeowHome 資料庫（共用 Supabase 專案版）
-- 共用專案規則（見 AGENTS.md §8）：所有資料表、函式、trigger、index、policy、bucket 一律以 `meow_` 開頭，
-- 不建立或修改其他名稱的物件，也不在 auth.users 上加 trigger，避免影響同一個 Supabase 專案裡的其他 App。
-- 執行方式：Supabase Dashboard → SQL Editor 貼上整份 → Run（可重複執行）。

-- =========================================================
-- 會員（每個 Supabase 帳號第一次使用 MeowHome 時由前端建立）
-- =========================================================
create table if not exists public.meow_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('member', 'admin')),
  terms_version text,
  terms_agreed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.meow_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meow_profiles where id = auth.uid() and role = 'admin');
$$;

-- Email 一律取自登入憑證（防止填別人的 Email 冒用）；角色只能由管理員或 SQL Editor 變更
create or replace function public.meow_guard_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.email := lower(auth.jwt() ->> 'email');
    if tg_op = 'INSERT' and new.role <> 'member' then
      raise exception '新會員只能是一般會員';
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role and not public.meow_is_admin() then
      raise exception '只有管理員可以變更角色';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists meow_guard_profile on public.meow_profiles;
create trigger meow_guard_profile before insert or update on public.meow_profiles for each row execute function public.meow_guard_profile();

-- =========================================================
-- 貓戶（一個帳號最多 2 個；每戶可有很多貓）
-- =========================================================
create table if not exists public.meow_households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.meow_profiles (id) on delete cascade,
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
create index if not exists meow_households_owner_idx on public.meow_households (owner_id);

create or replace function public.meow_enforce_household_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.meow_households where owner_id = new.owner_id) >= 2 then
    raise exception 'household_limit' using errcode = 'P0001', hint = '每個帳號最多建立 2 個貓戶';
  end if;
  return new;
end $$;
drop trigger if exists meow_households_limit on public.meow_households;
create trigger meow_households_limit before insert on public.meow_households for each row execute function public.meow_enforce_household_limit();

-- 認證徽章只能由管理員變更
create or replace function public.meow_protect_verified()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.verified_shelter is distinct from old.verified_shelter and auth.uid() is not null and not public.meow_is_admin() then
    raise exception '認證狀態只能由管理員變更';
  end if;
  return new;
end $$;
drop trigger if exists meow_protect_verified on public.meow_households;
create trigger meow_protect_verified before update on public.meow_households for each row execute function public.meow_protect_verified();

-- =========================================================
-- 貓咪
-- =========================================================
create table if not exists public.meow_cats (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.meow_households (id) on delete cascade,
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
create index if not exists meow_cats_household_idx on public.meow_cats (household_id);

-- =========================================================
-- 站內通知
-- =========================================================
create table if not exists public.meow_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.meow_profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists meow_notifications_user_idx on public.meow_notifications (user_id, created_at desc);

-- =========================================================
-- 中途之家認證申請
-- =========================================================
create table if not exists public.meow_shelter_verifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.meow_households (id) on delete cascade,
  applicant_id uuid not null references public.meow_profiles (id) on delete cascade,
  org_type text not null check (org_type in ('personal_foster', 'shelter_org')),
  org_name text,
  proof_url text,
  description text not null check (char_length(description) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewer_id uuid references public.meow_profiles (id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists meow_shelter_verifications_one_pending on public.meow_shelter_verifications (household_id) where status = 'pending';

create or replace function public.meow_notify_admins_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare hname text;
begin
  select name into hname from public.meow_households where id = new.household_id;
  insert into public.meow_notifications (user_id, type, title, body)
  select p.id, 'verification_request', '新的中途之家認證申請', '「' || coalesce(hname, '') || '」申請中途之家認證徽章'
  from public.meow_profiles p where p.role = 'admin';
  return new;
end $$;
drop trigger if exists meow_notify_admins_verification on public.meow_shelter_verifications;
create trigger meow_notify_admins_verification after insert on public.meow_shelter_verifications for each row execute function public.meow_notify_admins_verification();

create or replace function public.meow_review_verification(verification_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.meow_shelter_verifications;
begin
  if not public.meow_is_admin() then raise exception '只有管理員可以審核'; end if;
  select * into v from public.meow_shelter_verifications where id = verification_id for update;
  if v.id is null or v.status <> 'pending' then raise exception '找不到待審核的申請'; end if;
  update public.meow_shelter_verifications
     set status = case when approve then 'approved' else 'rejected' end, review_note = note, reviewer_id = auth.uid(), reviewed_at = now()
   where id = verification_id;
  if approve then update public.meow_households set verified_shelter = true, updated_at = now() where id = v.household_id; end if;
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (v.applicant_id, 'verification_result',
          case when approve then '恭喜！你的貓戶取得中途之家認證徽章' else '中途之家認證申請未通過' end,
          coalesce(note, case when approve then '徽章已顯示在你的貓戶上。' else '可以補充資料後再次申請。' end), '/me');
end $$;

-- 授權／移除管理員（只有管理員能呼叫；對方需先登入過 MeowHome）
create or replace function public.meow_set_admin(target_email text, make_admin boolean)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.meow_is_admin() then raise exception '只有管理員可以授權'; end if;
  if not make_admin and lower(trim(target_email)) = (select email from public.meow_profiles where id = auth.uid()) then
    raise exception '不能移除自己的管理員權限';
  end if;
  update public.meow_profiles set role = case when make_admin then 'admin' else 'member' end where email = lower(trim(target_email));
  get diagnostics n = row_count;
  return case when n = 0 then 'not_found' else 'ok' end;
end $$;

-- =========================================================
-- 網站設定（站台標誌等）
-- =========================================================
create table if not exists public.meow_site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.meow_profiles (id)
);
insert into public.meow_site_settings (key, value) values ('logo', '"house"') on conflict (key) do nothing;

-- =========================================================
-- 權限（RLS）
-- =========================================================
alter table public.meow_profiles enable row level security;
alter table public.meow_households enable row level security;
alter table public.meow_cats enable row level security;
alter table public.meow_notifications enable row level security;
alter table public.meow_shelter_verifications enable row level security;
alter table public.meow_site_settings enable row level security;

drop policy if exists "meow_profiles: read own or admin" on public.meow_profiles;
create policy "meow_profiles: read own or admin" on public.meow_profiles for select using (auth.uid() = id or public.meow_is_admin());
drop policy if exists "meow_profiles: insert own" on public.meow_profiles;
create policy "meow_profiles: insert own" on public.meow_profiles for insert with check (auth.uid() = id);
drop policy if exists "meow_profiles: update own" on public.meow_profiles;
create policy "meow_profiles: update own" on public.meow_profiles for update using (auth.uid() = id or public.meow_is_admin()) with check (auth.uid() = id or public.meow_is_admin());

drop policy if exists "meow_households: read" on public.meow_households;
create policy "meow_households: read" on public.meow_households for select using (default_visibility = 'public' or owner_id = auth.uid() or public.meow_is_admin());
drop policy if exists "meow_households: insert own" on public.meow_households;
create policy "meow_households: insert own" on public.meow_households for insert with check (owner_id = auth.uid() and verified_shelter = false);
drop policy if exists "meow_households: update own" on public.meow_households;
create policy "meow_households: update own" on public.meow_households for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "meow_households: delete own" on public.meow_households;
create policy "meow_households: delete own" on public.meow_households for delete using (owner_id = auth.uid());

drop policy if exists "meow_cats: read visible" on public.meow_cats;
create policy "meow_cats: read visible" on public.meow_cats for select using (
  exists (select 1 from public.meow_households h where h.id = meow_cats.household_id
          and (h.owner_id = auth.uid() or meow_cats.status = 'adoptable' or coalesce(meow_cats.visibility, h.default_visibility) = 'public'))
);
drop policy if exists "meow_cats: write own" on public.meow_cats;
create policy "meow_cats: write own" on public.meow_cats for all
  using (exists (select 1 from public.meow_households h where h.id = meow_cats.household_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.meow_households h where h.id = meow_cats.household_id and h.owner_id = auth.uid()));

drop policy if exists "meow_notifications: read own" on public.meow_notifications;
create policy "meow_notifications: read own" on public.meow_notifications for select using (user_id = auth.uid());
drop policy if exists "meow_notifications: mark own read" on public.meow_notifications;
create policy "meow_notifications: mark own read" on public.meow_notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "meow_verifications: read own or admin" on public.meow_shelter_verifications;
create policy "meow_verifications: read own or admin" on public.meow_shelter_verifications for select using (applicant_id = auth.uid() or public.meow_is_admin());
drop policy if exists "meow_verifications: apply" on public.meow_shelter_verifications;
create policy "meow_verifications: apply" on public.meow_shelter_verifications for insert with check (
  applicant_id = auth.uid() and status = 'pending'
  and exists (select 1 from public.meow_households h where h.id = household_id and h.owner_id = auth.uid() and h.verified_shelter = false)
);

drop policy if exists "meow_site_settings: public read" on public.meow_site_settings;
create policy "meow_site_settings: public read" on public.meow_site_settings for select using (true);
drop policy if exists "meow_site_settings: admin write" on public.meow_site_settings;
create policy "meow_site_settings: admin write" on public.meow_site_settings for all using (public.meow_is_admin()) with check (public.meow_is_admin());

-- =========================================================
-- 照片儲存（bucket 與 policy 名稱一律 meow 開頭）
-- =========================================================
insert into storage.buckets (id, name, public) values ('meow-cat-photos', 'meow-cat-photos', true)
  on conflict (id) do nothing;
drop policy if exists "meow: cat photos upload own folder" on storage.objects;
create policy "meow: cat photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'meow-cat-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "meow: cat photos delete own" on storage.objects;
create policy "meow: cat photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'meow-cat-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================
-- 指定第一位管理員：先用該 Google 帳號登入 MeowHome 一次，再把 Email 換成自己的並執行
-- =========================================================
-- update public.meow_profiles set role = 'admin' where email = '你的Gmail@gmail.com';
