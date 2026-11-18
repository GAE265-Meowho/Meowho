-- 0039（#504）：MeowHQ「影片 › 前導影片：配音」兩個角色的聲音規格（工具、Voice ID、參數），讓補錄時照同一組設定做。
-- 權限繼承「影片」頁：管理員（meow_is_admin）可以查看、新增、刪除；不開放修改，要改就新增一筆，最新一筆就是目前規格。
-- 只動 meow_ 開頭的物件；可重複執行。

create table if not exists public.meow_trailer_voice_specs (
  id uuid primary key default gen_random_uuid(),
  speaker text not null check (speaker in ('xiaoju', 'xiaojie')),
  tool text not null check (char_length(btrim(tool)) between 1 and 80),
  voice text not null check (char_length(btrim(voice)) between 1 and 120),
  settings text check (settings is null or char_length(settings) <= 500),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid default auth.uid() references public.meow_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists meow_trailer_voice_specs_speaker_idx on public.meow_trailer_voice_specs (speaker, created_at desc);

alter table public.meow_trailer_voice_specs enable row level security;

drop policy if exists "meow_trailer_voice_specs: read by admin" on public.meow_trailer_voice_specs;
create policy "meow_trailer_voice_specs: read by admin" on public.meow_trailer_voice_specs for select to authenticated
  using ((select public.meow_is_admin()));

drop policy if exists "meow_trailer_voice_specs: insert by admin" on public.meow_trailer_voice_specs;
create policy "meow_trailer_voice_specs: insert by admin" on public.meow_trailer_voice_specs for insert to authenticated
  with check ((select public.meow_is_admin()) and created_by = (select auth.uid()));

drop policy if exists "meow_trailer_voice_specs: delete by admin" on public.meow_trailer_voice_specs;
create policy "meow_trailer_voice_specs: delete by admin" on public.meow_trailer_voice_specs for delete to authenticated
  using ((select public.meow_is_admin()));

grant select, insert, delete on public.meow_trailer_voice_specs to authenticated;
