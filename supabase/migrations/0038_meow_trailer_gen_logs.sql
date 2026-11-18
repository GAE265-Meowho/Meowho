-- 0038（#494）：MeowHQ「影片 › 前導影片」每一段的生成紀錄（用了什麼工具、設定、哪些圖、prompt）。
-- 權限繼承「影片」頁（Tina 11-18）：能進頁面的管理員（meow_is_admin）都能查看、新增、刪除；不開放修改（要改就新增一筆，保留歷史）。
-- 只動 meow_ 開頭的物件；可重複執行。

create table if not exists public.meow_trailer_gen_logs (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('opening', 'cross', 'product', 'ending')),
  tool text not null check (char_length(btrim(tool)) between 1 and 80),
  settings text check (settings is null or char_length(settings) <= 200),
  inputs text check (inputs is null or char_length(inputs) <= 300),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 6000),
  negative_prompt text check (negative_prompt is null or char_length(negative_prompt) <= 2000),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid default auth.uid() references public.meow_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists meow_trailer_gen_logs_section_idx on public.meow_trailer_gen_logs (section, created_at desc);

alter table public.meow_trailer_gen_logs enable row level security;

drop policy if exists "meow_trailer_gen_logs: read by admin" on public.meow_trailer_gen_logs;
create policy "meow_trailer_gen_logs: read by admin" on public.meow_trailer_gen_logs for select to authenticated
  using ((select public.meow_is_admin()));

drop policy if exists "meow_trailer_gen_logs: insert by admin" on public.meow_trailer_gen_logs;
create policy "meow_trailer_gen_logs: insert by admin" on public.meow_trailer_gen_logs for insert to authenticated
  with check ((select public.meow_is_admin()) and created_by = (select auth.uid()));

drop policy if exists "meow_trailer_gen_logs: delete own or system admin" on public.meow_trailer_gen_logs;
drop policy if exists "meow_trailer_gen_logs: delete by admin" on public.meow_trailer_gen_logs;
create policy "meow_trailer_gen_logs: delete by admin" on public.meow_trailer_gen_logs for delete to authenticated
  using ((select public.meow_is_admin()));

grant select, insert, delete on public.meow_trailer_gen_logs to authenticated;
