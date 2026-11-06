-- 0026「任務證明」統一改名「試養報告」（規格 09 v0.7，#233）：只改對話串裡的系統訊息文字。
-- 函式名稱 meow_share_task_proof 與欄位 proof_shared_at 沿用舊名，前端不用改呼叫；已經送出的舊訊息不動。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。
create or replace function public.meow_share_task_proof(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.meow_task_runs; tid uuid;
begin
  select * into r from public.meow_task_runs where id = p_run_id and member_id = auth.uid() and status = 'completed';
  if r.id is null then raise exception 'run_not_found' using errcode = 'P0001', hint = '找不到完成的任務'; end if;
  tid := public.meow_open_thread(r.cat_id);
  if r.proof_shared_at is null then
    perform set_config('meow.task_flow', 'on', true);
    update public.meow_task_runs set proof_shared_at = now() where id = r.id;
    perform set_config('meow.task_flow', '', true);
    perform public.meow_thread_event(tid, '附上了試養報告。');
  end if;
  return tid;
end $$;
revoke all on function public.meow_share_task_proof(uuid) from public, anon;
grant execute on function public.meow_share_task_proof(uuid) to authenticated;
