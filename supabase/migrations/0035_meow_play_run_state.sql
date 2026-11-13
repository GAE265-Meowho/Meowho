-- 0035 領養任務（/play）的「進行中」狀態：按下去就建一筆進行中、每個節點存進度、可續玩、放棄、重玩（#354，交接文件 docs/play-tasks/7-進行中續玩放棄重玩.md）。
--   1. meow_task_runs.status 加第四種 closed（已結束：貓被領養或下架、或為了換貓而結束；不寫放棄標籤）。
--   2. meow_task_runs.env_report_id：開始那一刻定格用哪一份居家安全報告（房間已有 room_model_id）。
--   3. meow_start_play_run：開始一輪（個人喵戶、自己建好的房間、這間房間有 ready 的安全報告；已在做同一隻回傳原本那筆；做別隻擋下）。
--   4. meow_complete_play_run：完成進行中那筆並寫入 game_report（取代 meow_save_play_report 另外插一筆）。
--   5. meow_switch_task_run：為了換貓結束進行中那筆（closed，不寫放棄標籤，中途看不到）。
--   6. 貓不再待領養時，自動把進行中的任務改成 closed 並通知領養人（不算放棄）。
--   7. meow_thread_task_status 多回 completed_count（完成幾次）；重玩不覆蓋，每次都留一筆。
--   8. meow_task_run_guard 多擋 room_model_id、env_report_id、game_report：本人直接 update 進行中那筆只能改 progress。
--   9. 收回舊的 meow_save_play_report 執行權限：它不檢查房間與安全報告、直接建一筆已完成，會繞過開始前的檢查。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4），先給子哲審。

-- 1. 狀態多一個 closed
alter table public.meow_task_runs drop constraint if exists meow_task_runs_status_check;
alter table public.meow_task_runs add constraint meow_task_runs_status_check
  check (status in ('in_progress', 'completed', 'abandoned', 'closed'));

-- 2. 開始時定格的安全報告
alter table public.meow_task_runs add column if not exists env_report_id uuid references public.meow_env_reports (id) on delete set null;

-- 2b. 本人直接 update 進行中那筆只能改 progress（其餘照 0017；開始時定格的房間、報告與試養報告只能由函式寫）
create or replace function public.meow_task_run_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('meow.task_flow', true), '') = 'on' then return new; end if;
  if old.status <> 'in_progress' or new.status is distinct from old.status or new.member_id is distinct from old.member_id
     or new.cat_id is distinct from old.cat_id or new.version_id is distinct from old.version_id
     or new.summary is distinct from old.summary or new.proof_shared_at is distinct from old.proof_shared_at
     or new.finished_at is distinct from old.finished_at or new.started_at is distinct from old.started_at
     or new.room_model_id is distinct from old.room_model_id or new.env_report_id is distinct from old.env_report_id
     or new.game_report is distinct from old.game_report then
    raise exception 'run_not_found' using errcode = 'P0001', hint = '只能更新進行中任務的進度';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 3. 開始一輪：不再用示範房間當備案，沒有房間或報告就不能開始（錯誤代碼讓畫面說明下一步）
create or replace function public.meow_start_play_run(p_cat_id uuid, p_room_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; vid uuid; rid uuid; other uuid; hid uuid; rep public.meow_env_reports; room public.meow_room_models;
begin
  if auth.uid() is null or public.meow_is_suspended(auth.uid()) then
    raise exception 'message_suspended' using errcode = 'P0001', hint = '目前無法進行任務';
  end if;
  -- 只有中途喵戶不算：中途沒有自己家的 3D 房間，一定要有個人喵戶
  if not exists (select 1 from public.meow_households where owner_id = auth.uid() and caretaker_type = 'cat_owner') then
    raise exception 'household_required' using errcode = 'P0001', hint = '請先建立個人喵戶';
  end if;
  select * into c from public.meow_cats where id = p_cat_id;
  if c.id is null or c.status <> 'adoptable' or public.meow_cat_keeper(p_cat_id) = auth.uid() then
    raise exception 'run_cat_not_ready' using errcode = 'P0001', hint = '這隻貓目前不能進行領養任務';
  end if;
  -- 已經在做：同一隻回傳原本那筆，別隻擋下
  select id, cat_id into rid, other from public.meow_task_runs where member_id = auth.uid() and status = 'in_progress';
  if rid is not null then
    if other = p_cat_id then return rid; end if;
    raise exception 'run_in_progress' using errcode = 'P0001', hint = '你正在進行另一隻貓的領養任務，要先完成或放棄';
  end if;
  select r.* into room from public.meow_room_models r join public.meow_households h on h.id = r.owner_household_id
   where r.id = p_room_id and h.owner_id = auth.uid() and h.caretaker_type = 'cat_owner';
  if room.id is null then
    raise exception 'run_room_not_ready' using errcode = 'P0001', hint = '請先建立你家的 3D 房間';
  end if;
  if room.status <> 'ready' or room.completed_at is null then
    raise exception 'run_room_pending' using errcode = 'P0001', hint = '你家的 3D 房間還在處理中，好了會通知你';
  end if;
  hid := room.owner_household_id;
  select * into rep from public.meow_env_reports where household_id = hid and room_model_id = p_room_id order by created_at desc limit 1;
  if rep.id is null or rep.status = 'failed' then
    raise exception 'run_report_missing' using errcode = 'P0001', hint = '這間房間還沒有居家安全報告';
  end if;
  if rep.status <> 'ready' then
    raise exception 'run_report_pending' using errcode = 'P0001', hint = '居家安全報告還在處理中，好了會通知你';
  end if;
  vid := public.meow_prepare_cat_tasks(p_cat_id);
  insert into public.meow_task_runs (member_id, cat_id, version_id, room_model_id, env_report_id)
  values (auth.uid(), p_cat_id, vid, p_room_id, rep.id) returning id into rid;
  return rid;
end $$;

-- 4. 完成：進行中那筆改成 completed 並寫入 game_report（上限 30 KB，格式照 0033）
create or replace function public.meow_complete_play_run(p_run_id uuid, p_report jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.meow_task_runs;
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' or pg_column_size(p_report) > 30000 then
    raise exception 'play_report_invalid' using errcode = 'P0001', hint = '試養報告的格式不對';
  end if;
  select * into r from public.meow_task_runs where id = p_run_id and member_id = auth.uid() and status = 'in_progress' for update;
  if r.id is null then raise exception 'run_not_found' using errcode = 'P0001', hint = '找不到進行中的任務'; end if;
  perform set_config('meow.task_flow', 'on', true);
  update public.meow_task_runs set status = 'completed', game_report = p_report, finished_at = now(), updated_at = now() where id = r.id;
  perform set_config('meow.task_flow', '', true);
  return r.id;
end $$;

-- 5. 為了換貓而結束：不寫放棄標籤，中途看不到
create or replace function public.meow_switch_task_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.meow_task_runs;
begin
  select * into r from public.meow_task_runs where id = p_run_id and member_id = auth.uid() and status = 'in_progress' for update;
  if r.id is null then raise exception 'run_not_found' using errcode = 'P0001', hint = '找不到進行中的任務'; end if;
  perform set_config('meow.task_flow', 'on', true);
  update public.meow_task_runs set status = 'closed', finished_at = now(), updated_at = now() where id = r.id;
  perform set_config('meow.task_flow', '', true);
end $$;

-- 6. 貓不再待領養（被領養、下架）：進行中的任務自動 closed，通知領養人，不寫放棄標籤
create or replace function public.meow_close_runs_on_cat_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if old.status = 'adoptable' and new.status <> 'adoptable' then
    for r in select id, member_id from public.meow_task_runs where cat_id = new.id and status = 'in_progress' loop
      perform set_config('meow.task_flow', 'on', true);
      update public.meow_task_runs set status = 'closed', finished_at = now(), updated_at = now() where id = r.id;
      perform set_config('meow.task_flow', '', true);
      insert into public.meow_notifications (user_id, type, title, body, link)
      values (r.member_id, 'task', '領養任務已結束', new.name || ' 不再開放領養，你可以開始別隻貓的領養任務。', '/cats/' || new.id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists meow_cats_close_runs on public.meow_cats;
create trigger meow_cats_close_runs after update of status on public.meow_cats
  for each row execute function public.meow_close_runs_on_cat_change();

-- 7. 對話串顯示用：其餘照 0033，多回 completed_count
create or replace function public.meow_thread_task_status(p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.meow_threads; is_keeper boolean; done public.meow_task_runs; n int;
begin
  select * into t from public.meow_threads where id = p_thread_id;
  if t.id is null then return null; end if;
  is_keeper := public.meow_thread_keeper(p_thread_id) = auth.uid();
  if not is_keeper and t.member_id is distinct from auth.uid() then return null; end if;
  select * into done from public.meow_task_runs
   where cat_id = t.cat_id and member_id = t.member_id and status = 'completed' order by finished_at desc limit 1;
  select count(*) into n from public.meow_task_runs where cat_id = t.cat_id and member_id = t.member_id and status = 'completed';
  return jsonb_build_object(
    'completed', done.id is not null,
    'completed_at', done.finished_at,
    'completed_count', n,
    'proof', case when done.id is not null and (done.proof_shared_at is not null or not is_keeper) then jsonb_build_object(
      'run_id', done.id, 'summary', done.summary, 'progress', done.progress, 'shared_at', done.proof_shared_at,
      'game_report', done.game_report,
      'tasks', (select content -> 'tasks' from public.meow_cat_task_versions where id = done.version_id)) end,
    'abandons', case when is_keeper then coalesce((
      select jsonb_agg(jsonb_build_object('reasons', a.reasons, 'note', a.note, 'day', a.day, 'at', a.created_at) order by a.created_at)
        from public.meow_task_abandons a where a.cat_id = t.cat_id and a.member_id = t.member_id), '[]'::jsonb) end
  );
end $$;

revoke all on function public.meow_start_play_run(uuid, text) from public, anon;
grant execute on function public.meow_start_play_run(uuid, text) to authenticated;
revoke all on function public.meow_complete_play_run(uuid, jsonb) from public, anon;
grant execute on function public.meow_complete_play_run(uuid, jsonb) to authenticated;
revoke all on function public.meow_switch_task_run(uuid) from public, anon;
grant execute on function public.meow_switch_task_run(uuid) to authenticated;
revoke all on function public.meow_close_runs_on_cat_change() from public, anon, authenticated;
revoke all on function public.meow_thread_task_status(uuid) from public, anon;
grant execute on function public.meow_thread_task_status(uuid) to authenticated;
-- 9. 舊的 meow_save_play_report（0033）保留函式本體，但不再開放呼叫
revoke all on function public.meow_save_play_report(uuid, text, jsonb) from public, anon, authenticated;
