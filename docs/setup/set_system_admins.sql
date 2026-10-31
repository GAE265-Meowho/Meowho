-- 指定／批次指定系統管理員（system_admin）
-- 用法：在 Supabase → SQL Editor 貼上執行。
-- 規則：
--   1. 對方必須先用 Google 登入過一次（才會有 meow_profiles）
--   2. 可有多位系統管理員；不可撤銷最後一位（DB 有保護）
--   3. Email 請小寫；與 Google 登入信箱一致
-- 結果：看下方「結果」查詢——matched = 有改到；missing = 名單裡還沒登入過

-- ↓↓↓ 只改這裡：一列一個 Email（可加可刪）↓↓↓
with wanted(email) as (
  values
    ('somebaby.tina@gmail.com')
    -- ,('組員二@gmail.com')
),
normalized as (
  select lower(btrim(email)) as email from wanted
),
updated as (
  update public.meow_profiles p
  set role = 'system_admin'
  from normalized n
  where p.email = n.email
  returning p.email
)
-- 結果
select
  n.email,
  case when u.email is not null then 'ok（已是／已設為 system_admin）'
       else 'missing（此 Email 還沒登入過，請先登入網站一次）'
  end as result
from normalized n
left join updated u on u.email = n.email
order by n.email;

-- 確認目前所有系統管理員
-- select id, email, display_name, role from public.meow_profiles where role = 'system_admin' order by email;
