-- MeowHQ｜喵星總部：後台按模組授權的資料庫結構（T-HQ-02，Issue #19）
-- 依據：docs/hq/01 §3、§4.4～4.6、R1～R8；決策 003；docs/modules/admin-moderation.md 草案。
-- 共用專案規則（AGENTS.md §7）：所有資料表、函式、trigger、index、policy 一律 meow_ 開頭；不碰 auth.users；可重複執行。
-- ⚠ 尚未執行。執行前須經 Tina 確認（AGENTS.md §7.4）；注意 PR 備註：執行後舊的隱藏後台 /mh-console-8k2p 會暫時不能使用。
-- 錯誤以代碼回報（例外訊息即代碼，hint 為白話說明）：permission_denied、need_system_admin、target_is_system_admin、
--   target_not_admin、reason_required、last_system_admin、module_not_grantable、invalid_role、invalid_until、invalid_email、
--   already_suspended、not_suspended、already_banned、banned、role_change_via_function_only、audit_logs_immutable、not_found。

-- =========================================================
-- 1. 角色：member／admin／system_admin
--    只在尚未升級時執行一次：現有 admin 一律成為 system_admin（Tina 已同意）；重跑不會再把「管理員」升級
-- =========================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.meow_profiles'::regclass and conname = 'meow_profiles_role_check'
       and pg_get_constraintdef(oid) like '%system_admin%'
  ) then
    alter table public.meow_profiles drop constraint if exists meow_profiles_role_check;
    update public.meow_profiles set role = 'system_admin' where role = 'admin';
    alter table public.meow_profiles add constraint meow_profiles_role_check check (role in ('member', 'admin', 'system_admin'));
  end if;
end $$;

-- =========================================================
-- 2. 資料表（寫入一律經函式；前端只能讀自己有權看的列）
-- =========================================================
create table if not exists public.meow_admin_module_grants (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.meow_profiles (id) on delete cascade,
  module text not null check (module in ('report_moderation', 'user_management', 'products', 'knowledge', 'virtual_assets')),  -- 不含 admin_authorization
  granted_by uuid references public.meow_profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (admin_id, module)
);

create table if not exists public.meow_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null,   -- 不設外鍵：稽核日誌永久保留，不受帳號刪除影響
  action text not null check (action in ('suspend', 'unsuspend', 'revoke_grant', 'revoke_badge', 'takedown', 'relist', 'ban', 'unban', 'grant_module', 'grant_badge', 'set_role')),
  target_type text not null,
  target_id text not null,
  reason text not null check (char_length(btrim(reason)) > 0),
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists meow_audit_logs_actor_idx on public.meow_audit_logs (actor_id, created_at desc);
create index if not exists meow_audit_logs_target_idx on public.meow_audit_logs (target_type, target_id);
create index if not exists meow_audit_logs_created_idx on public.meow_audit_logs (created_at desc);

-- 停權狀態只以本表為準（生效中＝未解除且未到期）；meow_profiles 不另加欄位
create table if not exists public.meow_user_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.meow_profiles (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) > 0),
  suspended_by uuid references public.meow_profiles (id) on delete set null,
  suspended_at timestamptz not null default now(),
  suspended_until timestamptz,   -- null＝直到手動解除
  lifted_by uuid references public.meow_profiles (id) on delete set null,
  lifted_at timestamptz,
  lift_reason text
);
create unique index if not exists meow_user_suspensions_one_open on public.meow_user_suspensions (user_id) where lifted_at is null;

create table if not exists public.meow_banlist (
  id uuid primary key default gen_random_uuid(),
  google_email text not null check (google_email = lower(btrim(google_email))),
  auth_user_id uuid,   -- 防止帳號改信箱；對方尚未登入過則為 null
  reason text not null check (char_length(btrim(reason)) > 0),
  banned_by uuid references public.meow_profiles (id) on delete set null,
  banned_at timestamptz not null default now(),
  lifted_by uuid references public.meow_profiles (id) on delete set null,
  lifted_at timestamptz,
  lift_reason text
);
create unique index if not exists meow_banlist_one_open on public.meow_banlist (google_email) where lifted_at is null;

-- 稽核日誌永久保留，任何人都不能修改或刪除（含資料表擁有者）
create or replace function public.meow_audit_logs_immutable() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'audit_logs_immutable' using hint = '稽核日誌不能修改或刪除';
end $$;
drop trigger if exists meow_audit_logs_no_change on public.meow_audit_logs;
create trigger meow_audit_logs_no_change before update or delete on public.meow_audit_logs for each row execute function public.meow_audit_logs_immutable();
drop trigger if exists meow_audit_logs_no_truncate on public.meow_audit_logs;
create trigger meow_audit_logs_no_truncate before truncate on public.meow_audit_logs for each statement execute function public.meow_audit_logs_immutable();

-- =========================================================
-- 3. 權限判斷（每次呼叫都重新判斷，撤銷立即生效）
-- =========================================================
create or replace function public.meow_is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meow_user_suspensions s
     where s.user_id = p_user and s.lifted_at is null and (s.suspended_until is null or s.suspended_until > now())
  );
$$;

create or replace function public.meow_is_system_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meow_profiles where id = auth.uid() and role = 'system_admin');
$$;

-- 保留舊名（既有程式與 policy 使用）：系統管理員，或未被停權的管理員
create or replace function public.meow_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meow_profiles p
     where p.id = auth.uid() and (p.role = 'system_admin' or (p.role = 'admin' and not public.meow_is_suspended(p.id)))
  );
$$;

-- 系統管理員：全部模組；管理員：被授權且未停權的模組；Admin 授權只有系統管理員
create or replace function public.meow_has_module(p_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    p_module = any (array['report_moderation', 'user_management', 'products', 'knowledge', 'virtual_assets', 'admin_authorization'])
    and exists (
      select 1 from public.meow_profiles p
       where p.id = auth.uid()
         and (p.role = 'system_admin'
              or (p.role = 'admin' and p_module <> 'admin_authorization' and not public.meow_is_suspended(p.id)
                  and exists (select 1 from public.meow_admin_module_grants g where g.admin_id = p.id and g.module = p_module)))
    ), false);
$$;

-- 內部工具：原因必填、寫稽核日誌、依模組發通知（不開放給前端呼叫）
create or replace function public.meow_hq_require_reason(p_reason text) returns void language plpgsql set search_path = public as $$
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using hint = '請填寫原因';
  end if;
end $$;

create or replace function public.meow_hq_log(p_action text, p_target_type text, p_target_id text, p_reason text, p_detail jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.meow_audit_logs (actor_id, action, target_type, target_id, reason, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, btrim(p_reason), p_detail);
$$;

-- 通知對象＝有該模組權限（且未停權）的管理員＋全部系統管理員（R5）
create or replace function public.meow_notify_module(p_module text, p_type text, p_title text, p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.meow_notifications (user_id, type, title, body, link)
  select p.id, p_type, p_title, p_body, p_link
    from public.meow_profiles p
   where p.role = 'system_admin'
      or (p.role = 'admin' and p_module <> 'admin_authorization' and not public.meow_is_suspended(p.id)
          and exists (select 1 from public.meow_admin_module_grants g where g.admin_id = p.id and g.module = p_module));
$$;

-- =========================================================
-- 4. 既有 trigger 改為依模組／黑名單／最後一位系統管理員判斷
-- =========================================================
-- Email 取自登入憑證；角色只能經 meow_set_role；黑名單帳號不能建立會員資料（不在 auth.users 加 trigger）
create or replace function public.meow_guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    -- 新增時 Email 取自登入憑證；更新時只有本人才以憑證為準（0001 原本會把管理員的 Email 蓋到被修改的會員上）
    if tg_op = 'INSERT' then
      new.email := lower(auth.jwt() ->> 'email');
    elsif auth.uid() = old.id then
      new.email := lower(auth.jwt() ->> 'email');
    else
      new.email := old.email;
    end if;
    if tg_op = 'INSERT' then
      if new.role <> 'member' then raise exception '新會員只能是一般會員'; end if;
      if exists (select 1 from public.meow_banlist b where b.lifted_at is null and (b.google_email = new.email or b.auth_user_id = new.id)) then
        raise exception 'banned' using hint = '此帳號無法使用 Meow Home';
      end if;
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role and coalesce(current_setting('meow.hq_fn', true), '') <> '1' then
      raise exception 'role_change_via_function_only' using hint = '角色只能由系統管理員透過後台變更';
    end if;
  end if;
  return new;
end $$;

create or replace function public.meow_protect_last_system_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'system_admin' and (tg_op = 'DELETE' or new.role <> 'system_admin')
     and not exists (select 1 from public.meow_profiles where role = 'system_admin' and id <> old.id) then
    raise exception 'last_system_admin' using hint = '至少要保留一位系統管理員';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists meow_protect_last_system_admin on public.meow_profiles;
create trigger meow_protect_last_system_admin before update of role or delete on public.meow_profiles for each row execute function public.meow_protect_last_system_admin();

create or replace function public.meow_protect_verified()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.verified_shelter is distinct from old.verified_shelter and auth.uid() is not null and not public.meow_has_module('user_management') then
    raise exception '認證狀態只能由有「用戶權限管理」權限的管理員變更';
  end if;
  return new;
end $$;

-- 新的中途認證申請 → 通知有「用戶權限管理」者＋全部系統管理員
create or replace function public.meow_notify_admins_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare hname text;
begin
  select name into hname from public.meow_households where id = new.household_id;
  perform public.meow_notify_module('user_management', 'verification_request', '新的中途之家認證申請', '「' || coalesce(hname, '') || '」申請中途之家認證徽章');
  return new;
end $$;

-- =========================================================
-- 5. 後台操作函式（security definer；每個處置都必須填原因並寫稽核日誌）
-- =========================================================
-- 授予模組（僅系統管理員；不可授予 Admin 授權）
create or replace function public.meow_grant_module(p_admin_id uuid, p_module text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_profiles;
begin
  if not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  perform public.meow_hq_require_reason(p_reason);
  if p_module is null or p_module not in ('report_moderation', 'user_management', 'products', 'knowledge', 'virtual_assets') then
    raise exception 'module_not_grantable' using hint = '這個模組不能授予管理員';
  end if;
  select * into t from public.meow_profiles where id = p_admin_id;
  if t.id is null then raise exception 'not_found'; end if;
  if t.role <> 'admin' then raise exception 'target_not_admin' using hint = '只能授權給管理員'; end if;
  insert into public.meow_admin_module_grants (admin_id, module, granted_by) values (p_admin_id, p_module, auth.uid()) on conflict (admin_id, module) do nothing;
  perform public.meow_hq_log('grant_module', 'user', p_admin_id::text, p_reason, jsonb_build_object('module', p_module));
end $$;

create or replace function public.meow_revoke_module(p_admin_id uuid, p_module text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  perform public.meow_hq_require_reason(p_reason);
  delete from public.meow_admin_module_grants where admin_id = p_admin_id and module = p_module;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found'; end if;
  perform public.meow_hq_log('revoke_grant', 'user', p_admin_id::text, p_reason, jsonb_build_object('module', p_module));
end $$;

-- 變更角色（僅系統管理員；取代 meow_set_admin）。降為一般會員或系統管理員時清空模組授權；撤銷最後一位系統管理員由 trigger 擋下
create or replace function public.meow_set_role(p_email text, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_profiles;
begin
  if not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  perform public.meow_hq_require_reason(p_reason);
  if p_role is null or p_role not in ('system_admin', 'admin', 'member') then raise exception 'invalid_role'; end if;
  select * into t from public.meow_profiles where email = lower(btrim(p_email));
  if t.id is null then raise exception 'not_found' using hint = '對方需先登入過 Meow Home'; end if;
  if p_role <> 'member' and public.meow_is_suspended(t.id) then raise exception 'target_suspended' using hint = '停權中的帳號不能升為管理員，請先解除停權'; end if;
  perform set_config('meow.hq_fn', '1', true);   -- 只在這一個 update 期間允許變更角色（見 meow_guard_profile）
  update public.meow_profiles set role = p_role where id = t.id;
  perform set_config('meow.hq_fn', '', true);
  if p_role <> 'admin' then delete from public.meow_admin_module_grants where admin_id = t.id; end if;
  perform public.meow_hq_log('set_role', 'user', t.id::text, p_reason, jsonb_build_object('from', t.role, 'to', p_role));
end $$;

-- 舊介面（既有前端使用）：轉呼叫 meow_set_role
create or replace function public.meow_set_admin(target_email text, make_admin boolean)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform public.meow_set_role(target_email, case when make_admin then 'admin' else 'member' end, '舊版後台操作');
  return 'ok';
exception when others then
  if sqlerrm = 'not_found' then return 'not_found'; end if;
  raise;
end $$;

-- 停權：需「用戶權限管理」；對象是管理員時須為系統管理員並收回其全部模組授權；系統管理員不能被停權
-- R1（自動婉拒審核中領養申請）待領養申請資料表建立後在此補上（UT-HQDB-12）
create or replace function public.meow_suspend_user(p_user_id uuid, p_reason text, p_until timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_profiles;
begin
  if not public.meow_has_module('user_management') then raise exception 'permission_denied' using hint = '你沒有這個模組的權限'; end if;
  perform public.meow_hq_require_reason(p_reason);
  select * into t from public.meow_profiles where id = p_user_id;
  if t.id is null then raise exception 'not_found'; end if;
  if t.role = 'system_admin' then raise exception 'target_is_system_admin' using hint = '系統管理員不能被停權'; end if;
  if t.role = 'admin' and not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  if p_until is not null and p_until <= now() then raise exception 'invalid_until'; end if;
  update public.meow_user_suspensions set lifted_at = suspended_until, lift_reason = '期限到期'
   where user_id = p_user_id and lifted_at is null and suspended_until is not null and suspended_until <= now();
  if public.meow_is_suspended(p_user_id) then raise exception 'already_suspended'; end if;
  insert into public.meow_user_suspensions (user_id, reason, suspended_by, suspended_until) values (p_user_id, btrim(p_reason), auth.uid(), p_until);
  if t.role = 'admin' then delete from public.meow_admin_module_grants where admin_id = p_user_id; end if;
  perform public.meow_hq_log('suspend', 'user', p_user_id::text, p_reason, jsonb_build_object('until', p_until, 'role', t.role));
end $$;

create or replace function public.meow_unsuspend_user(p_user_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_profiles; n int;
begin
  if not public.meow_has_module('user_management') then raise exception 'permission_denied' using hint = '你沒有這個模組的權限'; end if;
  perform public.meow_hq_require_reason(p_reason);
  select * into t from public.meow_profiles where id = p_user_id;
  if t.id is null then raise exception 'not_found'; end if;
  if t.role = 'admin' and not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  update public.meow_user_suspensions set lifted_at = now(), lifted_by = auth.uid(), lift_reason = btrim(p_reason)
   where user_id = p_user_id and lifted_at is null and (suspended_until is null or suspended_until > now());
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_suspended'; end if;
  perform public.meow_hq_log('unsuspend', 'user', p_user_id::text, p_reason);
end $$;

-- 黑名單：僅系統管理員；以 Google Email 為準（去空白、小寫），同時記下 auth 使用者 id
create or replace function public.meow_ban_email(p_email text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, ''))); t public.meow_profiles;
begin
  if not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  perform public.meow_hq_require_reason(p_reason);
  if e = '' then raise exception 'invalid_email'; end if;
  select * into t from public.meow_profiles where email = e;
  -- 黑名單只用於貓友與貓戶長（一般會員）；管理員與系統管理員須先撤銷身分
  if t.role = 'system_admin' then raise exception 'target_is_system_admin' using hint = '黑名單不適用於系統管理員，請先撤銷其身分'; end if;
  if t.role = 'admin' then raise exception 'target_is_admin' using hint = '黑名單不適用於管理員，請先撤銷其身分'; end if;
  if exists (select 1 from public.meow_banlist where google_email = e and lifted_at is null) then raise exception 'already_banned'; end if;
  insert into public.meow_banlist (google_email, auth_user_id, reason, banned_by) values (e, t.id, btrim(p_reason), auth.uid());
  perform public.meow_hq_log('ban', 'email', e, p_reason);
end $$;

create or replace function public.meow_unban_email(p_email text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, ''))); n int;
begin
  if not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  perform public.meow_hq_require_reason(p_reason);
  update public.meow_banlist set lifted_at = now(), lifted_by = auth.uid(), lift_reason = btrim(p_reason) where google_email = e and lifted_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found'; end if;
  perform public.meow_hq_log('unban', 'email', e, p_reason);
end $$;

-- 中途認證審核（需「用戶權限管理」）；核准時授予徽章並寫稽核日誌
create or replace function public.meow_review_verification(verification_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.meow_shelter_verifications;
begin
  if not public.meow_has_module('user_management') then raise exception 'permission_denied' using hint = '你沒有這個模組的權限'; end if;
  select * into v from public.meow_shelter_verifications where id = verification_id for update;
  if v.id is null or v.status <> 'pending' then raise exception '找不到待審核的申請'; end if;
  update public.meow_shelter_verifications
     set status = case when approve then 'approved' else 'rejected' end, review_note = note, reviewer_id = auth.uid(), reviewed_at = now()
   where id = verification_id;
  if approve then
    update public.meow_households set verified_shelter = true, updated_at = now() where id = v.household_id;
    perform public.meow_hq_log('grant_badge', 'household', v.household_id::text, coalesce(nullif(btrim(note), ''), '審核通過'), jsonb_build_object('verification_id', verification_id));
  end if;
  insert into public.meow_notifications (user_id, type, title, body, link)
  values (v.applicant_id, 'verification_result',
          case when approve then '恭喜！你的貓戶取得中途之家認證徽章' else '中途之家認證申請未通過' end,
          coalesce(note, case when approve then '徽章已顯示在你的貓戶上。' else '可以補充資料後再次申請。' end), '/me');
end $$;

-- 撤銷中途徽章（需「用戶權限管理」，原因必填）；撤銷後立即失去認證中途權限（R2）
create or replace function public.meow_revoke_badge(p_household_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.meow_has_module('user_management') then raise exception 'permission_denied' using hint = '你沒有這個模組的權限'; end if;
  perform public.meow_hq_require_reason(p_reason);
  update public.meow_households set verified_shelter = false, updated_at = now() where id = p_household_id and verified_shelter;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using hint = '這個貓戶沒有中途徽章'; end if;
  perform public.meow_hq_log('revoke_badge', 'household', p_household_id::text, p_reason);
end $$;

-- =========================================================
-- 6. 權限（RLS 與函式執行權）
-- =========================================================
alter table public.meow_admin_module_grants enable row level security;
alter table public.meow_audit_logs enable row level security;
alter table public.meow_user_suspensions enable row level security;
alter table public.meow_banlist enable row level security;
revoke all on public.meow_admin_module_grants, public.meow_audit_logs, public.meow_user_suspensions, public.meow_banlist from anon, authenticated;
grant select on public.meow_admin_module_grants, public.meow_audit_logs, public.meow_user_suspensions, public.meow_banlist to authenticated;

drop policy if exists "meow_admin_module_grants: read own or system admin" on public.meow_admin_module_grants;
create policy "meow_admin_module_grants: read own or system admin" on public.meow_admin_module_grants for select to authenticated
  using (admin_id = auth.uid() or (select public.meow_is_system_admin()));
drop policy if exists "meow_audit_logs: read own or system admin" on public.meow_audit_logs;
create policy "meow_audit_logs: read own or system admin" on public.meow_audit_logs for select to authenticated
  using ((select public.meow_is_system_admin()) or (actor_id = auth.uid() and (select public.meow_is_admin())));
drop policy if exists "meow_user_suspensions: read" on public.meow_user_suspensions;
create policy "meow_user_suspensions: read" on public.meow_user_suspensions for select to authenticated
  using (user_id = auth.uid() or (select public.meow_has_module('user_management')));
drop policy if exists "meow_banlist: system admin read" on public.meow_banlist;
create policy "meow_banlist: system admin read" on public.meow_banlist for select to authenticated using ((select public.meow_is_system_admin()));

-- 既有資料表的 policy：管理員改依模組判斷；只給 authenticated 的 policy 不會讓匿名訪客呼叫權限函式
drop policy if exists "meow_profiles: read own or admin" on public.meow_profiles;
drop policy if exists "meow_profiles: read own" on public.meow_profiles;
create policy "meow_profiles: read own" on public.meow_profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "meow_profiles: read by user management" on public.meow_profiles;
create policy "meow_profiles: read by user management" on public.meow_profiles for select to authenticated using ((select public.meow_has_module('user_management')));
drop policy if exists "meow_profiles: update own" on public.meow_profiles;
create policy "meow_profiles: update own" on public.meow_profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "meow_households: read" on public.meow_households;
create policy "meow_households: read" on public.meow_households for select using (default_visibility = 'public' or owner_id = auth.uid());
drop policy if exists "meow_households: read by user management" on public.meow_households;
create policy "meow_households: read by user management" on public.meow_households for select to authenticated using ((select public.meow_has_module('user_management')));

drop policy if exists "meow_verifications: read own or admin" on public.meow_shelter_verifications;
drop policy if exists "meow_verifications: read own" on public.meow_shelter_verifications;
create policy "meow_verifications: read own" on public.meow_shelter_verifications for select to authenticated using (applicant_id = auth.uid());
drop policy if exists "meow_verifications: read by user management" on public.meow_shelter_verifications;
create policy "meow_verifications: read by user management" on public.meow_shelter_verifications for select to authenticated using ((select public.meow_has_module('user_management')));

drop policy if exists "meow_site_settings: admin write" on public.meow_site_settings;
drop policy if exists "meow_site_settings: system admin write" on public.meow_site_settings;
create policy "meow_site_settings: system admin write" on public.meow_site_settings for all to authenticated
  using ((select public.meow_is_system_admin())) with check ((select public.meow_is_system_admin()));

-- 函式執行權：收回 anon（與 PUBLIC），只開放給登入者；內部工具與 trigger 函式不開放給前端
revoke execute on function
  public.meow_is_admin(), public.meow_is_system_admin(), public.meow_has_module(text),
  public.meow_set_admin(text, boolean), public.meow_review_verification(uuid, boolean, text),
  public.meow_grant_module(uuid, text, text), public.meow_revoke_module(uuid, text, text), public.meow_set_role(text, text, text),
  public.meow_suspend_user(uuid, text, timestamptz), public.meow_unsuspend_user(uuid, text),
  public.meow_ban_email(text, text), public.meow_unban_email(text, text), public.meow_revoke_badge(uuid, text)
  from public, anon;
grant execute on function
  public.meow_is_admin(), public.meow_is_system_admin(), public.meow_has_module(text),
  public.meow_set_admin(text, boolean), public.meow_review_verification(uuid, boolean, text),
  public.meow_grant_module(uuid, text, text), public.meow_revoke_module(uuid, text, text), public.meow_set_role(text, text, text),
  public.meow_suspend_user(uuid, text, timestamptz), public.meow_unsuspend_user(uuid, text),
  public.meow_ban_email(text, text), public.meow_unban_email(text, text), public.meow_revoke_badge(uuid, text)
  to authenticated;
revoke execute on function
  public.meow_is_suspended(uuid), public.meow_hq_require_reason(text), public.meow_hq_log(text, text, text, text, jsonb),
  public.meow_notify_module(text, text, text, text, text), public.meow_notify_admins_verification(),
  public.meow_audit_logs_immutable(), public.meow_protect_last_system_admin(), public.meow_guard_profile()
  from public, anon, authenticated;
