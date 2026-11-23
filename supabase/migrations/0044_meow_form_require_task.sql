-- 0044 領養問卷加一項「是否必須完成領養任務？」：中途在問卷設定打開後，領養人要先完成這隻貓的領養任務，才能送出問卷（提出領養）。
--   1. meow_adoption_forms.require_task（預設 false，維持原本「沒做任務也能申請、送出前提醒」的行為，規格 09 §7.4）。
--   2. 送出時檢查：問卷要求任務、而填寫人沒有這隻貓「已完成」的 meow_task_runs，就擋下（response_task_required）。
--      草稿照樣可以存；只擋「改成 submitted」那一刻。已經送出的回覆不受之後改設定影響。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。

alter table public.meow_adoption_forms add column if not exists require_task boolean not null default false;

-- security definer：填寫人讀得到自己的任務紀錄，但用 definer 才不受之後 RLS 調整影響
create or replace function public.meow_adoption_response_task_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft')
     and exists (select 1 from public.meow_adoption_forms f where f.id = new.form_id and f.require_task)
     and not exists (select 1 from public.meow_adoption_forms f join public.meow_task_runs r on r.cat_id = f.cat_id
                     where f.id = new.form_id and r.member_id = new.respondent_id and r.status = 'completed') then
    raise exception 'response_task_required' using errcode = 'P0001', hint = '這隻貓的中途要求先完成領養任務，才能送出問卷';
  end if;
  return new;
end $$;
drop trigger if exists meow_adoption_responses_task_guard on public.meow_adoption_responses;
create trigger meow_adoption_responses_task_guard before insert or update on public.meow_adoption_responses
  for each row execute function public.meow_adoption_response_task_guard();
