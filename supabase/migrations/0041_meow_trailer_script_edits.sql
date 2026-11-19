-- 0041（#513）：MeowHQ「影片 › 前導影片：分鏡」在頁面上編修分鏡表（畫面、旁白／字幕、音效）與每格的中文 prompt。
-- 只記錄改動：原稿在程式（src/lib/hq/videos/trailer.ts），這張表每一筆是某一格某一欄的新內容，最新一筆生效；value 為 null＝還原原稿。
-- target：鏡頭用穩定代號（例 s07，取自該鏡第一格分鏡圖代號，重新編號也不會變）、中文 prompt 用分鏡圖代號（例 s07-1）。
-- 權限繼承「影片」頁：管理員（meow_is_admin）可以查看、新增、刪除；不開放修改，保留每次編修的歷史。
-- 只動 meow_ 開頭的物件；可重複執行。

create table if not exists public.meow_trailer_script_edits (
  id uuid primary key default gen_random_uuid(),
  target text not null check (target ~ '^s[0-9]{2}(-[0-9])?$'),
  field text not null check (field in ('picture', 'voice', 'sfx', 'zh_prompt')),
  value text check (value is null or char_length(value) <= 3000),
  created_by uuid default auth.uid() references public.meow_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists meow_trailer_script_edits_target_idx on public.meow_trailer_script_edits (target, field, created_at desc);

alter table public.meow_trailer_script_edits enable row level security;

drop policy if exists "meow_trailer_script_edits: read by admin" on public.meow_trailer_script_edits;
create policy "meow_trailer_script_edits: read by admin" on public.meow_trailer_script_edits for select to authenticated
  using ((select public.meow_is_admin()));

drop policy if exists "meow_trailer_script_edits: insert by admin" on public.meow_trailer_script_edits;
create policy "meow_trailer_script_edits: insert by admin" on public.meow_trailer_script_edits for insert to authenticated
  with check ((select public.meow_is_admin()) and created_by = (select auth.uid()));

drop policy if exists "meow_trailer_script_edits: delete by admin" on public.meow_trailer_script_edits;
create policy "meow_trailer_script_edits: delete by admin" on public.meow_trailer_script_edits for delete to authenticated
  using ((select public.meow_is_admin()));

grant select, insert, delete on public.meow_trailer_script_edits to authenticated;
