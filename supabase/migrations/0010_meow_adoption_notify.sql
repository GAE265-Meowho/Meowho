-- 0010 領養申請通知（#89 補）：領養人送出問卷時通知這隻貓的喵戶長；喵戶長更新狀態時通知領養人。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。通知內容不放回答，只放貓名與連結。

create or replace function public.meow_notify_adoption_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare cat_name text; cat_id uuid; owner uuid; who text;
begin
  select c.name, c.id, h.owner_id into cat_name, cat_id, owner
    from public.meow_adoption_forms f
    join public.meow_cats c on c.id = f.cat_id
    join public.meow_households h on h.id = c.household_id
   where f.id = new.form_id;
  if owner is null then return new; end if;
  who := coalesce(nullif(trim(new.respondent_name), ''), '一位會員');

  -- 送出（新增時直接送出，或草稿改成送出）→ 通知喵戶長
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    insert into public.meow_notifications (user_id, type, title, body, link)
    values (owner, 'adoption_response', '有人想領養「' || cat_name || '」',
            who || ' 填好了「' || cat_name || '」的領養問卷。', '/me/adoptions#cat-' || cat_id);
  -- 喵戶長改狀態 → 通知領養人
  elsif tg_op = 'UPDATE' and old.status <> 'draft' and new.status is distinct from old.status then
    insert into public.meow_notifications (user_id, type, title, body, link)
    values (new.respondent_id, 'adoption_status',
            '「' || cat_name || '」的領養申請有新進度',
            case new.status
              when 'contact' then '中途標記為「待聯絡」，會再和你聯繫。'
              when 'follow_up' then '中途想進一步了解你，請留意後續聯繫。'
              when 'declined' then '這次沒有媒合成功，謝謝你願意給貓一個家。'
              else '中途更新了申請狀態。'
            end, '/me');
  end if;
  return new;
end $$;
drop trigger if exists meow_adoption_responses_notify on public.meow_adoption_responses;
create trigger meow_adoption_responses_notify after insert or update of status on public.meow_adoption_responses
  for each row execute function public.meow_notify_adoption_response();
