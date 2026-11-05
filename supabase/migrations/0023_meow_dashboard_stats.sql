-- MeowHQ KPI Dashboard 資源統計（#218）
-- 僅管理員可呼叫；回傳 DB 容量與 Storage bucket 用量（不含檔名／路徑細節以外的個資）。
-- 可重複執行。執行前須經發起人確認（AGENTS.md §7.4）。

create or replace function public.meow_dashboard_resource_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_db bigint;
  v_buckets jsonb;
begin
  -- service_role（Dashboard API 聚合）或已登入管理員
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or not public.meow_is_admin()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select pg_database_size(current_database()) into v_db;

  select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', bucket_id,
      'bytes', bytes,
      'files', files
    ) order by bytes desc), '[]'::jsonb)
  into v_buckets
  from (
    select
      o.bucket_id,
      coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint as bytes,
      count(*)::int as files
    from storage.objects o
    where o.bucket_id like 'meow-%'
    group by o.bucket_id
  ) s;

  return jsonb_build_object(
    'db_bytes', v_db,
    'buckets', v_buckets
  );
end;
$$;

revoke all on function public.meow_dashboard_resource_stats() from public, anon;
grant execute on function public.meow_dashboard_resource_stats() to authenticated, service_role;

comment on function public.meow_dashboard_resource_stats() is
  'MeowHQ Dashboard（#218）：管理員讀取 DB 容量與 meow-* Storage 用量';
