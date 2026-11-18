-- 0036 喵戶長填的「你或同住的人對貓過敏嗎」（#354，渝茜 2026-11-18）：試養報告用它給建議。
-- 健康資訊不放 meow_households.home（公開的喵戶整筆讀得到），和每月預算放同一張只有喵戶長本人讀得到的表（0025 的 RLS 不變）。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。
-- 沒執行前網站照常運作：表單存不進 allergy 時會退回只存預算（household-rules.ts 的 budgetRowLegacy）。
alter table public.meow_household_budgets add column if not exists allergy text;

alter table public.meow_household_budgets drop constraint if exists meow_household_budgets_allergy_check;
alter table public.meow_household_budgets add constraint meow_household_budgets_allergy_check
  check (allergy is null or allergy in ('none', 'mild', 'severe', 'unsure'));

comment on column public.meow_household_budgets.allergy is
  '你或同住的人對貓過敏嗎：none 沒有、mild 有症狀輕微、severe 有症狀明顯、unsure 不確定；只有喵戶長本人讀得到';
