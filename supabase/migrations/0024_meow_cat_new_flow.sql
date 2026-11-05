-- 0024 中途建貓資料的新流程（#206，設計稿 docs/design/new-cat-flow.html）
-- 1. meow_cats 加上新欄位：個性量表、補充說明、小小壞習慣、照護與其他資料、介紹、三張角度照、封面、給 AI 寫劇情的健康內容
-- 2. 生活照（photo_paths）上限 5 → 6；角度照另外存 photo_angles。跟誰處得來（compat）多了陌生人和說明，容量放大
-- 3. 舊資料配合新的標籤清單（src/lib/cat-profile/tags.ts、adoption.ts）：
--    - 健康標籤裡的結紮、疫苗、驅蟲、FIV／FeLV 移到醫療細項（medical）；「需每日用藥」改名「每天吃藥」；「特殊飲食」「慢性病」併進病史
--    - 個性標籤「安靜」改成「慵懶」；「親其他貓」改成跟其他貓處得來（compat.cats）
--    - 生活習慣的「護食」「抓家具」「愛咬手」移到小小壞習慣（behavior，偶爾）；「夜間活躍」改名「半夜跑酷」
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。

-- =========================================================
-- 1. 新欄位
-- =========================================================
alter table public.meow_cats add column if not exists personality_scale jsonb;                          -- {energy, bond, brave, adapt}：1–5，沒填 null
alter table public.meow_cats add column if not exists personality_notes jsonb not null default '{}'::jsonb; -- 每條拉桿的補充說明
alter table public.meow_cats add column if not exists behavior jsonb not null default '{}'::jsonb;          -- {項目: {level: none／sometimes／often／unknown, note}}
alter table public.meow_cats add column if not exists care jsonb not null default '{}'::jsonb;              -- 照護配合度、適應速度、摸摸牠、來源、體重…
alter table public.meow_cats add column if not exists intro text;                                           -- 介紹（預設是座右銘，中途可改）
alter table public.meow_cats add column if not exists photo_angles jsonb not null default '{}'::jsonb;      -- {front, left, back}：三張角度照的路徑
alter table public.meow_cats add column if not exists cover text;                                           -- 中途選的封面：a:front／a:left／a:back／o:生活照序號
alter table public.meow_cats add column if not exists ai_story jsonb;                                       -- {tags, text}：交給 AI 安排試養劇情的健康內容

alter table public.meow_cats drop constraint if exists meow_cats_new_flow_check;
alter table public.meow_cats add constraint meow_cats_new_flow_check check (
  (personality_scale is null or (jsonb_typeof(personality_scale) = 'object' and pg_column_size(personality_scale) <= 500))
  and jsonb_typeof(personality_notes) = 'object' and pg_column_size(personality_notes) <= 2000
  and jsonb_typeof(behavior) = 'object' and pg_column_size(behavior) <= 4000
  and jsonb_typeof(care) = 'object' and pg_column_size(care) <= 8000
  and (intro is null or char_length(intro) <= 200)
  and jsonb_typeof(photo_angles) = 'object' and pg_column_size(photo_angles) <= 2000
  and (cover is null or cover ~ '^(a:(front|left|back)|o:[0-9])$')
  and (ai_story is null or (jsonb_typeof(ai_story) = 'object' and pg_column_size(ai_story) <= 2000))
);

-- 個性量表每一條只能是 1–5 或 null
create or replace function public.meow_scale_ok(p jsonb)
returns boolean language sql immutable as $$
  select p is null or not exists (
    select 1 from jsonb_each(p) e
     where e.key not in ('energy', 'bond', 'brave', 'adapt')
        or not (jsonb_typeof(e.value) = 'null' or (jsonb_typeof(e.value) = 'number' and (e.value)::numeric in (1, 2, 3, 4, 5)))
  )
$$;
alter table public.meow_cats drop constraint if exists meow_cats_personality_scale_check;
alter table public.meow_cats add constraint meow_cats_personality_scale_check check (public.meow_scale_ok(personality_scale));

-- =========================================================
-- 2. 生活照 6 張、相處容量
-- =========================================================
alter table public.meow_cats drop constraint if exists meow_cats_photo_paths_check;
alter table public.meow_cats add constraint meow_cats_photo_paths_check check (cardinality(photo_paths) <= 6);

alter table public.meow_cats drop constraint if exists meow_cats_compat_check;
alter table public.meow_cats add constraint meow_cats_compat_check
  check (jsonb_typeof(compat) = 'object' and pg_column_size(compat) <= 2000);

-- =========================================================
-- 3. 舊資料配合新的標籤清單（只處理還有舊標籤的貓，重跑不會重複）
-- =========================================================
do $$
declare
  r record; m jsonb; cp jsonb; bh jsonb; extra text[];
  old_health text[] := array['已結紮', '疫苗已完成', '已驅蟲', 'FIV 陽性', 'FeLV 陽性', '需每日用藥', '特殊飲食', '慢性病'];
  old_habits text[] := array['護食', '抓家具', '愛咬手', '夜間活躍'];
begin
  perform set_config('meow.cat_flow', 'on', true);
  for r in
    select id, health_tags, personality_tags, habits, medical, compat, behavior from public.meow_cats
     where health_tags && old_health or personality_tags && array['安靜', '親其他貓'] or habits && old_habits
  loop
    -- 醫療細項：只補還不知道的
    m := coalesce(r.medical, '{}'::jsonb);
    if '已結紮' = any (r.health_tags) and coalesce(m ->> 'neutered', 'unknown') = 'unknown' then m := m || '{"neutered": "done"}'; end if;
    if '疫苗已完成' = any (r.health_tags) and coalesce(jsonb_typeof(m -> 'vaccineDoses'), 'null') = 'null' then m := m || '{"vaccineDoses": 3}'; end if;
    if '已驅蟲' = any (r.health_tags) then
      if coalesce(m ->> 'dewormInternal', 'unknown') = 'unknown' then m := m || '{"dewormInternal": "done"}'; end if;
      if coalesce(m ->> 'dewormExternal', 'unknown') = 'unknown' then m := m || '{"dewormExternal": "done"}'; end if;
    end if;
    if coalesce(m ->> 'fivFelv', 'untested') = 'untested' then
      if 'FIV 陽性' = any (r.health_tags) and 'FeLV 陽性' = any (r.health_tags) then m := m || '{"fivFelv": "both_positive"}';
      elsif 'FIV 陽性' = any (r.health_tags) then m := m || '{"fivFelv": "fiv_positive"}';
      elsif 'FeLV 陽性' = any (r.health_tags) then m := m || '{"fivFelv": "felv_positive"}';
      end if;
    end if;
    extra := array_remove(array[
      case when '特殊飲食' = any (r.health_tags) then '特殊飲食' end,
      case when '慢性病' = any (r.health_tags) then '慢性病' end], null);
    if cardinality(extra) > 0 then
      m := m || jsonb_build_object('history', left(concat_ws('；', nullif(btrim(m ->> 'history'), ''), array_to_string(extra, '、')), 300));
    end if;

    -- 相處：親其他貓 → 跟其他貓處得來（不蓋掉已經填的）
    cp := coalesce(r.compat, '{}'::jsonb);
    if '親其他貓' = any (r.personality_tags) and coalesce(cp ->> 'cats', 'unknown') = 'unknown' then cp := cp || '{"cats": "yes"}'; end if;

    -- 小小壞習慣：舊的生活習慣移過來，程度記「偶爾」
    bh := coalesce(r.behavior, '{}'::jsonb);
    if '護食' = any (r.habits) and not bh ? 'guard' then bh := bh || '{"guard": {"level": "sometimes", "note": null}}'; end if;
    if '抓家具' = any (r.habits) and not bh ? 'scratch' then bh := bh || '{"scratch": {"level": "sometimes", "note": null}}'; end if;
    if '愛咬手' = any (r.habits) and not bh ? 'bite' then bh := bh || '{"bite": {"level": "sometimes", "note": "會咬手"}}'; end if;

    update public.meow_cats set
      medical = m,
      neutered = case when '已結紮' = any (r.health_tags) then true else neutered end,
      compat = cp,
      behavior = bh,
      health_tags = array(select distinct t from unnest(
        array_cat(array_remove(r.health_tags, '需每日用藥'), case when '需每日用藥' = any (r.health_tags) then array['每天吃藥'] else '{}'::text[] end)
      ) t where t <> all (old_health)),
      personality_tags = array(select distinct case t when '安靜' then '慵懶' else t end from unnest(r.personality_tags) t where t <> '親其他貓'),
      habits = array(select distinct case t when '夜間活躍' then '半夜跑酷' else t end from unnest(r.habits) t where t not in ('護食', '抓家具', '愛咬手')),
      updated_at = now()
    where id = r.id;
  end loop;
  perform set_config('meow.cat_flow', '', true);
end $$;
