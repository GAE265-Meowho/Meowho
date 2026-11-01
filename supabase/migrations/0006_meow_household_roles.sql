-- 0006 依身分建立喵戶、貓咪送養文欄位（#82）
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。
-- 結構化欄位用 jsonb：資料庫只檢查型別與大小，內容格式由程式（zod）檢查，清單之後改程式即可。

-- =========================================================
-- 喵戶：一般飼主的居住環境、中途的預設送養條件、立案單位資料
-- =========================================================
alter table public.meow_households add column if not exists home jsonb;
alter table public.meow_households add column if not exists adoption_terms jsonb;
alter table public.meow_households add column if not exists org_name text;
alter table public.meow_households add column if not exists org_proof_url text;

alter table public.meow_households drop constraint if exists meow_households_home_check;
alter table public.meow_households add constraint meow_households_home_check
  check (home is null or (jsonb_typeof(home) = 'object' and pg_column_size(home) <= 4000));
alter table public.meow_households drop constraint if exists meow_households_adoption_terms_check;
alter table public.meow_households add constraint meow_households_adoption_terms_check
  check (adoption_terms is null or (jsonb_typeof(adoption_terms) = 'object' and pg_column_size(adoption_terms) <= 4000));
alter table public.meow_households drop constraint if exists meow_households_org_check;
alter table public.meow_households add constraint meow_households_org_check
  check (char_length(coalesce(org_name, '')) <= 60 and char_length(coalesce(org_proof_url, '')) <= 500);

-- 身分建立後不能切換（欄位依身分不同，要換就另建一個喵戶）
create or replace function public.meow_lock_caretaker_type()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.caretaker_type is distinct from old.caretaker_type then
    raise exception 'caretaker_type_locked' using errcode = 'P0001', hint = '喵戶的身分建立後不能變更';
  end if;
  return new;
end $$;
drop trigger if exists meow_households_lock_type on public.meow_households;
create trigger meow_households_lock_type before update on public.meow_households
  for each row execute function public.meow_lock_caretaker_type();

-- =========================================================
-- 喵戶數量上限改讀設定：meow_site_settings.household_limit，沒有這筆或為 null 就不限制（開發期間，#82）
-- =========================================================
create or replace function public.meow_enforce_household_limit()
returns trigger language plpgsql set search_path = public as $$
declare lim int;
begin
  select case when jsonb_typeof(value) = 'number' then (value)::text::int end into lim
    from public.meow_site_settings where key = 'household_limit';
  if lim is not null and (select count(*) from public.meow_households where owner_id = new.owner_id) >= lim then
    raise exception 'household_limit' using errcode = 'P0001', hint = format('每個帳號最多建立 %s 個喵戶', lim);
  end if;
  return new;
end $$;
insert into public.meow_site_settings (key, value) values ('household_limit', 'null') on conflict (key) do nothing;

-- =========================================================
-- 貓咪：醫療細項、相處、生活習慣、送養條件、交接物品
-- =========================================================
alter table public.meow_cats add column if not exists medical jsonb not null default '{}'::jsonb;
alter table public.meow_cats add column if not exists compat jsonb not null default '{}'::jsonb;
alter table public.meow_cats add column if not exists habits text[] not null default '{}';
-- null＝沿用喵戶的預設送養條件
alter table public.meow_cats add column if not exists adoption_terms jsonb;
alter table public.meow_cats add column if not exists handover text[] not null default '{}';

alter table public.meow_cats drop constraint if exists meow_cats_medical_check;
alter table public.meow_cats add constraint meow_cats_medical_check
  check (jsonb_typeof(medical) = 'object' and pg_column_size(medical) <= 4000);
alter table public.meow_cats drop constraint if exists meow_cats_compat_check;
alter table public.meow_cats add constraint meow_cats_compat_check
  check (jsonb_typeof(compat) = 'object' and pg_column_size(compat) <= 1000);
alter table public.meow_cats drop constraint if exists meow_cats_adoption_terms_check;
alter table public.meow_cats add constraint meow_cats_adoption_terms_check
  check (adoption_terms is null or (jsonb_typeof(adoption_terms) = 'object' and pg_column_size(adoption_terms) <= 4000));
alter table public.meow_cats drop constraint if exists meow_cats_lists_check;
alter table public.meow_cats add constraint meow_cats_lists_check
  check (cardinality(habits) <= 20 and cardinality(handover) <= 20);
