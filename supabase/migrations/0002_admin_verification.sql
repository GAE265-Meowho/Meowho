-- MeowHome 0002：管理員、中途之家認證、站內通知、網站設定（Issue #3）
-- 在 0001 之後，於 Supabase SQL Editor 貼上整份執行一次。

-- ---------- 會員 Email（管理員授權用）----------
alter table public.profiles add column if not exists email text;
update public.profiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null;
create unique index if not exists profiles_email_idx on public.profiles (email);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          new.raw_user_meta_data ->> 'avatar_url', lower(new.email))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- ---------- 管理員判斷 ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 角色只能由管理員（或在 SQL Editor 直接執行時）變更
create or replace function public.protect_profile_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception '只有管理員可以變更角色';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles for each row execute function public.protect_profile_role();

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles: admin read all" on public.profiles;
create policy "profiles: admin read all" on public.profiles for select using (public.is_admin());

-- 授權／移除管理員（只有管理員能呼叫）
create or replace function public.set_admin(target_email text, make_admin boolean)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception '只有管理員可以授權'; end if;
  if not make_admin and lower(target_email) = (select email from public.profiles where id = auth.uid()) then
    raise exception '不能移除自己的管理員權限';
  end if;
  update public.profiles set role = case when make_admin then 'admin' else 'member' end where email = lower(trim(target_email));
  get diagnostics n = row_count;
  if n = 0 then return 'not_found'; end if;
  return 'ok';
end $$;

-- 認證徽章只能由管理員變更
create or replace function public.protect_verified()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.verified_shelter is distinct from old.verified_shelter and auth.uid() is not null and not public.is_admin() then
    raise exception '認證狀態只能由管理員變更';
  end if;
  return new;
end $$;
drop trigger if exists protect_verified on public.households;
create trigger protect_verified before update on public.households for each row execute function public.protect_verified();

drop policy if exists "households: admin read all" on public.households;
create policy "households: admin read all" on public.households for select using (public.is_admin());

-- ---------- 站內通知（FR-11）----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notifications: mark own read" on public.notifications;
create policy "notifications: mark own read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 中途之家認證申請（FR-15-04）----------
create table if not exists public.shelter_verifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  org_type text not null check (org_type in ('personal_foster', 'shelter_org')),
  org_name text,
  proof_url text,
  description text not null check (char_length(description) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewer_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists shelter_verifications_one_pending on public.shelter_verifications (household_id) where status = 'pending';
alter table public.shelter_verifications enable row level security;

drop policy if exists "verifications: read own or admin" on public.shelter_verifications;
create policy "verifications: read own or admin" on public.shelter_verifications for select using (applicant_id = auth.uid() or public.is_admin());
drop policy if exists "verifications: apply for own household" on public.shelter_verifications;
create policy "verifications: apply for own household" on public.shelter_verifications for insert with check (
  applicant_id = auth.uid() and status = 'pending'
  and exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid() and h.verified_shelter = false)
);

-- 送出申請 → 通知所有管理員
create or replace function public.notify_admins_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare hname text;
begin
  select name into hname from public.households where id = new.household_id;
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'verification_request', '新的中途之家認證申請', '「' || coalesce(hname, '') || '」申請中途之家認證徽章', null
  from public.profiles p where p.role = 'admin';
  return new;
end $$;
drop trigger if exists notify_admins_verification on public.shelter_verifications;
create trigger notify_admins_verification after insert on public.shelter_verifications for each row execute function public.notify_admins_verification();

-- 管理員審核：核准時貓戶取得徽章，並通知申請人
create or replace function public.review_verification(verification_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.shelter_verifications;
begin
  if not public.is_admin() then raise exception '只有管理員可以審核'; end if;
  select * into v from public.shelter_verifications where id = verification_id for update;
  if v.id is null or v.status <> 'pending' then raise exception '找不到待審核的申請'; end if;
  update public.shelter_verifications
     set status = case when approve then 'approved' else 'rejected' end, review_note = note, reviewer_id = auth.uid(), reviewed_at = now()
   where id = verification_id;
  if approve then update public.households set verified_shelter = true, updated_at = now() where id = v.household_id; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (v.applicant_id, 'verification_result',
          case when approve then '恭喜！你的貓戶取得中途之家認證徽章' else '中途之家認證申請未通過' end,
          coalesce(note, case when approve then '徽章已顯示在你的貓戶上。' else '可以補充資料後再次申請。' end), '/me');
end $$;

-- ---------- 網站設定（站台標誌等，FR-15-08）----------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
alter table public.site_settings enable row level security;
drop policy if exists "site_settings: public read" on public.site_settings;
create policy "site_settings: public read" on public.site_settings for select using (true);
drop policy if exists "site_settings: admin write" on public.site_settings;
create policy "site_settings: admin write" on public.site_settings for all using (public.is_admin()) with check (public.is_admin());
insert into public.site_settings (key, value) values ('logo', '"house"') on conflict (key) do nothing;

-- ---------- 指定第一位管理員 ----------
-- 先用該 Google 帳號登入網站一次，再把下面這行的 Email 換成自己的並執行：
-- update public.profiles set role = 'admin' where email = '你的Gmail@gmail.com';
