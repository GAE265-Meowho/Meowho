-- 0030 領養任務改成「領養人按下才產生」（子哲 11/6）：
--   1. 中途建完貓不用再出任務：meow_publish_cat 只檢查 3D 模型，不再要求任務版本。
--   2. 領養人在前台按「進行領養任務」時，由 /api/cats/[id]/tasks/prepare 準備這隻貓的任務；
--      渝茜的任務 worker（#237）接上之前，先用這隻貓年齡層的系統預設任務（meow_prepare_cat_tasks）。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。

-- 1. 準備出發找新主人：只要 3D 貓已確認
create or replace function public.meow_publish_cat(p_cat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.meow_cats;
begin
  select * into c from public.meow_cats where id = p_cat_id for update;
  if c.id is null or public.meow_cat_keeper(p_cat_id) is distinct from auth.uid() then
    raise exception 'cat_not_keeper' using errcode = 'P0001', hint = '只有這隻貓的喵戶長能讓牠出發';
  end if;
  if c.status <> 'preparing' then
    raise exception 'cat_not_preparing' using errcode = 'P0001', hint = '這隻貓已經出發了';
  end if;
  if not public.meow_cat_model_confirmed(p_cat_id) then
    raise exception 'cat_model_not_confirmed' using errcode = 'P0001', hint = '3D 模型還沒確認';
  end if;
  perform set_config('meow.cat_flow', 'on', true);
  update public.meow_cats set status = 'adoptable', updated_at = now() where id = p_cat_id;
  perform set_config('meow.cat_flow', '', true);
end $$;

-- 2. 領養人按「進行領養任務」：這隻貓還沒有任務版本，就用年齡層的系統預設任務存一版；已經有就回傳目前版本
create or replace function public.meow_prepare_cat_tasks(p_cat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; tpl public.meow_task_templates; vid uuid; nextv int;
begin
  if auth.uid() is null then
    raise exception 'login_required' using errcode = 'P0001', hint = '請先登入';
  end if;
  select * into c from public.meow_cats where id = p_cat_id;
  if c.id is null or c.status <> 'adoptable' then
    raise exception 'run_cat_not_ready' using errcode = 'P0001', hint = '這隻貓目前不能進行領養任務';
  end if;
  select current_version_id into vid from public.meow_cat_task_sets where cat_id = p_cat_id;
  if vid is not null then return vid; end if;
  select * into tpl from public.meow_task_templates where life_stage = coalesce(c.life_stage, 'adult') and is_active;
  if tpl.id is null then
    raise exception 'task_template_missing' using errcode = 'P0001', hint = '這個年齡層還沒有系統預設任務';
  end if;
  perform set_config('meow.task_flow', 'on', true);
  insert into public.meow_cat_task_sets (cat_id, source) values (p_cat_id, 'default') on conflict (cat_id) do nothing;
  perform 1 from public.meow_cat_task_sets where cat_id = p_cat_id for update;
  -- 兩個人同時按：先拿到鎖的人建好了就直接用
  select current_version_id into vid from public.meow_cat_task_sets where cat_id = p_cat_id;
  if vid is null then
    select coalesce(max(version), 0) + 1 into nextv from public.meow_cat_task_versions where cat_id = p_cat_id;
    insert into public.meow_cat_task_versions (cat_id, version, source, template_id, content, difficulty)
    values (p_cat_id, nextv, 'default', tpl.id, tpl.content, 2) returning id into vid;
    update public.meow_cat_task_sets set source = 'default', current_version_id = vid, updated_at = now() where cat_id = p_cat_id;
  end if;
  perform set_config('meow.task_flow', '', true);
  return vid;
end $$;

revoke all on function public.meow_prepare_cat_tasks(uuid) from public, anon;
grant execute on function public.meow_prepare_cat_tasks(uuid) to authenticated;
revoke all on function public.meow_publish_cat(uuid) from public, anon;
grant execute on function public.meow_publish_cat(uuid) to authenticated;
