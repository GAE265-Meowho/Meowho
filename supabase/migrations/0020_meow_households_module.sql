-- 0020｜MeowHQ 貓戶管理模組（Issue #179，Tina 2026-11-04）
-- 1. 新增可授權的後台模組 households（貓戶管理）
-- 2. 有這個模組的管理員可以讀全部貓戶、貓咪、貓戶長（只讀）
-- 3. 上線時先把現有的管理員全部授權（之後由系統管理員在「Admin 授權」調整）
-- 可重複執行。

-- 1. 模組清單
alter table public.meow_admin_module_grants drop constraint if exists meow_admin_module_grants_module_check;
alter table public.meow_admin_module_grants add constraint meow_admin_module_grants_module_check
  check (module in ('households', 'report_moderation', 'user_management', 'products', 'knowledge', 'virtual_assets'));

create or replace function public.meow_has_module(p_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    p_module = any (array['households', 'report_moderation', 'user_management', 'products', 'knowledge', 'virtual_assets', 'admin_authorization'])
    and exists (
      select 1 from public.meow_profiles p
       where p.id = auth.uid()
         and (p.role = 'system_admin'
              or (p.role = 'admin' and p_module <> 'admin_authorization' and not public.meow_is_suspended(p.id)
                  and exists (select 1 from public.meow_admin_module_grants g where g.admin_id = p.id and g.module = p_module)))
    ), false);
$$;

create or replace function public.meow_grant_module(p_admin_id uuid, p_module text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.meow_profiles;
begin
  if not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  perform public.meow_hq_require_reason(p_reason);
  if p_module is null or p_module not in ('households', 'report_moderation', 'user_management', 'products', 'knowledge', 'virtual_assets') then
    raise exception 'module_not_grantable' using hint = '這個模組不能授予管理員';
  end if;
  select * into t from public.meow_profiles where id = p_admin_id;
  if t.id is null then raise exception 'not_found'; end if;
  if t.role <> 'admin' then raise exception 'target_not_admin' using hint = '只能授權給管理員'; end if;
  insert into public.meow_admin_module_grants (admin_id, module, granted_by) values (p_admin_id, p_module, auth.uid()) on conflict (admin_id, module) do nothing;
  perform public.meow_hq_log('grant_module', 'user', p_admin_id::text, p_reason, jsonb_build_object('module', p_module));
end $$;

-- 2. 讀取權限（只讀）
drop policy if exists "meow_households: read by households module" on public.meow_households;
create policy "meow_households: read by households module" on public.meow_households for select to authenticated
  using ((select public.meow_has_module('households')));
drop policy if exists "meow_cats: read by households module" on public.meow_cats;
create policy "meow_cats: read by households module" on public.meow_cats for select to authenticated
  using ((select public.meow_has_module('households')));
drop policy if exists "meow_profiles: read by households module" on public.meow_profiles;
create policy "meow_profiles: read by households module" on public.meow_profiles for select to authenticated
  using ((select public.meow_has_module('households')));

-- 3. 現有管理員全部授權（系統管理員本來就有全部模組，不需要）
insert into public.meow_admin_module_grants (admin_id, module, granted_by)
select p.id, 'households', null from public.meow_profiles p where p.role = 'admin'
on conflict (admin_id, module) do nothing;
