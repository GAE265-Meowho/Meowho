-- 0040 做過領養任務的個人喵戶刪得掉（#510）。
--   刪 meow_households 會連帶刪 meow_room_models、meow_env_reports（on delete cascade），
--   meow_task_runs.room_model_id、env_report_id 再由外鍵清成空值（on delete set null），這是一次 UPDATE。
--   0035 的 meow_task_run_guard 把它當成本人直接改定格欄位，拋出 run_not_found，整筆刪除被退回。
--   改法：外鍵連動（由其他觸發器引發，pg_trigger_depth() > 1）而且只是把房間、報告清成空值、其他欄位都沒動，就放行；
--   本人直接 update（深度 1）規則照 0035 不變。任務紀錄本來就跟著帳號（member_id），刪喵戶後紀錄與試養報告保留。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。

create or replace function public.meow_task_run_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('meow.task_flow', true), '') = 'on' then return new; end if;
  -- 外鍵連動清空定格的房間或報告（例如刪喵戶）：只有這兩欄變成空值，其他都沒動
  if pg_trigger_depth() > 1
     and (new.room_model_id is null or new.room_model_id is not distinct from old.room_model_id)
     and (new.env_report_id is null or new.env_report_id is not distinct from old.env_report_id)
     and (to_jsonb(new) - array['room_model_id', 'env_report_id', 'updated_at'])
       = (to_jsonb(old) - array['room_model_id', 'env_report_id', 'updated_at']) then
    return new;
  end if;
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
