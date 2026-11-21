-- 0043（#588）：前導影片配音新增阿芳聲線（鏡 13 一句），聲音規格的 speaker 允許 'afang'。
-- 只動 meow_ 開頭的物件；可重複執行。
alter table public.meow_trailer_voice_specs drop constraint if exists meow_trailer_voice_specs_speaker_check;
alter table public.meow_trailer_voice_specs
  add constraint meow_trailer_voice_specs_speaker_check check (speaker in ('xiaoju', 'xiaojie', 'afang'));
