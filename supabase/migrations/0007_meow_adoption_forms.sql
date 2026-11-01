-- 0007 領養問卷（#89）：中途在待領養貓的 profile 建立問卷，領養人申請時填寫。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。題目與答案格式由程式（zod）檢查，資料庫只檢查型別與大小。
-- 隱私：回覆只有填寫人與這隻貓的喵戶長看得到；領養人上傳的居家照片放私人 bucket。

-- =========================================================
-- 問卷（一隻貓一份）
-- =========================================================
create table if not exists public.meow_adoption_forms (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null unique references public.meow_cats (id) on delete cascade,
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 60 and pg_column_size(questions) <= 60000),
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 只有待領養的貓能開放問卷
create or replace function public.meow_adoption_form_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_open and (select status from public.meow_cats where id = new.cat_id) is distinct from 'adoptable' then
    raise exception 'form_cat_not_adoptable' using errcode = 'P0001', hint = '只有待領養的貓能開放領養問卷';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists meow_adoption_forms_guard on public.meow_adoption_forms;
create trigger meow_adoption_forms_guard before insert or update on public.meow_adoption_forms
  for each row execute function public.meow_adoption_form_guard();

-- 貓不再是待領養時，問卷自動停止接受填寫
create or replace function public.meow_close_form_when_not_adoptable()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from 'adoptable' then
    update public.meow_adoption_forms set is_open = false where cat_id = new.id and is_open;
  end if;
  return new;
end $$;
drop trigger if exists meow_cats_close_form on public.meow_cats;
create trigger meow_cats_close_form after update of status on public.meow_cats
  for each row execute function public.meow_close_form_when_not_adoptable();

alter table public.meow_adoption_forms enable row level security;

-- 開放中的問卷：看得到這隻貓的人都看得到題目；喵戶長看得到自己的全部問卷
drop policy if exists "meow_adoption_forms: read" on public.meow_adoption_forms;
create policy "meow_adoption_forms: read" on public.meow_adoption_forms for select using (
  (is_open and exists (select 1 from public.meow_cats c where c.id = meow_adoption_forms.cat_id))
  or exists (select 1 from public.meow_cats c join public.meow_households h on h.id = c.household_id
             where c.id = meow_adoption_forms.cat_id and h.owner_id = auth.uid())
);
drop policy if exists "meow_adoption_forms: write own" on public.meow_adoption_forms;
create policy "meow_adoption_forms: write own" on public.meow_adoption_forms for all
  using (exists (select 1 from public.meow_cats c join public.meow_households h on h.id = c.household_id
                 where c.id = meow_adoption_forms.cat_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.meow_cats c join public.meow_households h on h.id = c.household_id
                      where c.id = meow_adoption_forms.cat_id and h.owner_id = auth.uid()));

-- =========================================================
-- 回覆（領養人填寫）
-- =========================================================
create table if not exists public.meow_adoption_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.meow_adoption_forms (id) on delete cascade,
  respondent_id uuid not null references public.meow_profiles (id) on delete cascade,
  -- 會員資料只有本人看得到，所以填寫時帶入顯示名稱給中途看
  respondent_name text check (char_length(respondent_name) <= 60),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 60000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 10),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'contact', 'follow_up', 'declined')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 同一個人對同一份問卷只能有一份還沒結束的回覆
alter table public.meow_adoption_responses add column if not exists respondent_name text;

create unique index if not exists meow_adoption_responses_one_active
  on public.meow_adoption_responses (form_id, respondent_id) where status <> 'declined';
create index if not exists meow_adoption_responses_respondent_idx on public.meow_adoption_responses (respondent_id);

-- 填寫人只能改自己的草稿並送出；喵戶長只能改送出後的狀態，不能改答案
create or replace function public.meow_adoption_response_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception 'response_bad_status' using errcode = 'P0001';
    end if;
  elsif auth.uid() = old.respondent_id then
    if old.status <> 'draft' then
      raise exception 'response_locked' using errcode = 'P0001', hint = '問卷送出後就不能再修改';
    end if;
    if new.status not in ('draft', 'submitted') then
      raise exception 'response_bad_status' using errcode = 'P0001';
    end if;
    new.form_id := old.form_id;
    new.respondent_id := old.respondent_id;
  else
    if old.status = 'draft' or new.status not in ('submitted', 'contact', 'follow_up', 'declined')
       or new.answers is distinct from old.answers or new.photo_paths is distinct from old.photo_paths then
      raise exception 'response_owner_status_only' using errcode = 'P0001', hint = '喵戶長只能更新回覆的狀態';
    end if;
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    new.submitted_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists meow_adoption_responses_guard on public.meow_adoption_responses;
create trigger meow_adoption_responses_guard before insert or update on public.meow_adoption_responses
  for each row execute function public.meow_adoption_response_guard();

alter table public.meow_adoption_responses enable row level security;

-- 只有填寫人與這隻貓的喵戶長看得到
drop policy if exists "meow_adoption_responses: read" on public.meow_adoption_responses;
create policy "meow_adoption_responses: read" on public.meow_adoption_responses for select using (
  respondent_id = auth.uid()
  or exists (select 1 from public.meow_adoption_forms f join public.meow_cats c on c.id = f.cat_id join public.meow_households h on h.id = c.household_id
             where f.id = meow_adoption_responses.form_id and h.owner_id = auth.uid())
);
drop policy if exists "meow_adoption_responses: insert own" on public.meow_adoption_responses;
create policy "meow_adoption_responses: insert own" on public.meow_adoption_responses for insert with check (
  respondent_id = auth.uid()
  and exists (select 1 from public.meow_adoption_forms f where f.id = meow_adoption_responses.form_id and f.is_open)
);
drop policy if exists "meow_adoption_responses: update" on public.meow_adoption_responses;
create policy "meow_adoption_responses: update" on public.meow_adoption_responses for update using (
  respondent_id = auth.uid()
  or exists (select 1 from public.meow_adoption_forms f join public.meow_cats c on c.id = f.cat_id join public.meow_households h on h.id = c.household_id
             where f.id = meow_adoption_responses.form_id and h.owner_id = auth.uid())
);
drop policy if exists "meow_adoption_responses: delete own draft" on public.meow_adoption_responses;
create policy "meow_adoption_responses: delete own draft" on public.meow_adoption_responses for delete using (
  respondent_id = auth.uid() and status = 'draft'
);

-- =========================================================
-- 領養人上傳的居家照片：私人 bucket，填寫人自己的資料夾；喵戶長只看得到回覆裡引用的照片
-- =========================================================
insert into storage.buckets (id, name, public) values ('meow-adoption-photos', 'meow-adoption-photos', false)
  on conflict (id) do nothing;
drop policy if exists "meow: adoption photos upload own folder" on storage.objects;
create policy "meow: adoption photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'meow-adoption-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "meow: adoption photos read" on storage.objects;
create policy "meow: adoption photos read" on storage.objects for select to authenticated using (
  bucket_id = 'meow-adoption-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.meow_adoption_responses r
               join public.meow_adoption_forms f on f.id = r.form_id
               join public.meow_cats c on c.id = f.cat_id
               join public.meow_households h on h.id = c.household_id
               where objects.name = any (r.photo_paths) and r.status <> 'draft' and h.owner_id = auth.uid())
  )
);
drop policy if exists "meow: adoption photos delete own" on storage.objects;
create policy "meow: adoption photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'meow-adoption-photos' and (storage.foldername(name))[1] = auth.uid()::text);
