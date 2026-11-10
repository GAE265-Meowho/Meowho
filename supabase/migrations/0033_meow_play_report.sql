-- 0033 虛擬飼養的試養報告給中途看：領養人玩完 /cats/[id]/play，報告存進 meow_task_runs，
--   對話串（meow_thread_task_status）跟原本的領養任務一樣顯示「系統認證」與可展開的試養報告；領養人按「附上試養報告」才分享給中途。
--   1. meow_task_runs 加 game_report（遊戲報告摘要：選擇、花費、照顧紀錄；不含家裡位置、不附裁切照）。
--   2. meow_save_play_report：領養人玩完呼叫，建一筆「已完成」的任務紀錄（任務版本沿用 meow_prepare_cat_tasks）。
--   3. meow_thread_task_status 的 proof 多回 game_report。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。

-- 1. 遊戲報告摘要（JSON 物件，上限約 30 KB）
alter table public.meow_task_runs add column if not exists game_report jsonb;
alter table public.meow_task_runs drop constraint if exists meow_task_runs_game_report_check;
alter table public.meow_task_runs add constraint meow_task_runs_game_report_check
  check (game_report is null or (jsonb_typeof(game_report) = 'object' and pg_column_size(game_report) <= 30000));

-- 2. 玩完遊戲：要有喵戶、這隻貓待領養、不是自己的貓；房間不是自己的就不記（遊戲沒有自己的 3D 房間時用示範房間）
create or replace function public.meow_save_play_report(p_cat_id uuid, p_room_id text, p_report jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; vid uuid; rid uuid; room text := p_room_id;
begin
  if auth.uid() is null or public.meow_is_suspended(auth.uid()) then
    raise exception 'message_suspended' using errcode = 'P0001', hint = '目前無法儲存報告';
  end if;
  if not public.meow_has_household(auth.uid()) then
    raise exception 'household_required' using errcode = 'P0001', hint = '請先建立喵戶';
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' or pg_column_size(p_report) > 30000 then
    raise exception 'play_report_invalid' using errcode = 'P0001', hint = '試養報告的格式不對';
  end if;
  select * into c from public.meow_cats where id = p_cat_id;
  if c.id is null or c.status <> 'adoptable' or public.meow_cat_keeper(p_cat_id) = auth.uid() then
    raise exception 'run_cat_not_ready' using errcode = 'P0001', hint = '這隻貓目前不能進行領養任務';
  end if;
  vid := public.meow_prepare_cat_tasks(p_cat_id);
  if room is not null and not exists (select 1 from public.meow_room_models r join public.meow_households h on h.id = r.owner_household_id
                                       where r.id = room and r.status = 'ready' and h.owner_id = auth.uid()) then
    room := null;
  end if;
  perform set_config('meow.task_flow', 'on', true);
  insert into public.meow_task_runs (member_id, cat_id, version_id, room_model_id, status, game_report, finished_at, updated_at)
  values (auth.uid(), p_cat_id, vid, room, 'completed', p_report, now(), now()) returning id into rid;
  perform set_config('meow.task_flow', '', true);
  return rid;
end $$;

-- 3. 對話串顯示用：proof 多回 game_report（其餘照 0017）
create or replace function public.meow_thread_task_status(p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.meow_threads; is_keeper boolean; done public.meow_task_runs;
begin
  select * into t from public.meow_threads where id = p_thread_id;
  if t.id is null then return null; end if;
  is_keeper := public.meow_thread_keeper(p_thread_id) = auth.uid();
  if not is_keeper and t.member_id is distinct from auth.uid() then return null; end if;
  select * into done from public.meow_task_runs
   where cat_id = t.cat_id and member_id = t.member_id and status = 'completed' order by finished_at desc limit 1;
  return jsonb_build_object(
    'completed', done.id is not null,
    'completed_at', done.finished_at,
    'proof', case when done.id is not null and (done.proof_shared_at is not null or not is_keeper) then jsonb_build_object(
      'run_id', done.id, 'summary', done.summary, 'progress', done.progress, 'shared_at', done.proof_shared_at,
      'game_report', done.game_report,
      'tasks', (select content -> 'tasks' from public.meow_cat_task_versions where id = done.version_id)) end,
    'abandons', case when is_keeper then coalesce((
      select jsonb_agg(jsonb_build_object('reasons', a.reasons, 'note', a.note, 'day', a.day, 'at', a.created_at) order by a.created_at)
        from public.meow_task_abandons a where a.cat_id = t.cat_id and a.member_id = t.member_id), '[]'::jsonb) end
  );
end $$;

revoke all on function public.meow_save_play_report(uuid, text, jsonb) from public, anon;
grant execute on function public.meow_save_play_report(uuid, text, jsonb) to authenticated;
revoke all on function public.meow_thread_task_status(uuid) from public, anon;
grant execute on function public.meow_thread_task_status(uuid) to authenticated;
