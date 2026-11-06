-- 示範貓合併（Tina 2026-11-06）：「好奇虎斑小貓」併進「第一隻虎斑貓」，變成同一隻貓的幼貓體型。
-- 幼貓貼圖是網站內建的靜態檔 public/hq-cat-models/cats/cat_20261030_140731/paint_albedo_kitten.png（「/」開頭的路徑原樣當網址）。
-- 預設顯示成貓（主表 base_version 仍是成貓）。
-- 0028；執行前須經 Tina 確認。可重複執行。
insert into public.meow_cat_model_variants (model_id, body_type, albedo_path, base_version, confirmed_albedo, updated_at)
select m.id, 'kitten', '/hq-cat-models/cats/cat_20261030_140731/paint_albedo_kitten.png', 'kitten-v1',
       '/hq-cat-models/cats/cat_20261030_140731/paint_albedo_kitten.png', now()
from public.meow_cat_models m
where m.id = 'cat_20261030_140731'
on conflict (model_id, body_type) do update
  set albedo_path = excluded.albedo_path, base_version = excluded.base_version,
      confirmed_albedo = excluded.confirmed_albedo, updated_at = excluded.updated_at;

-- 好奇虎斑小貓若也曾匯入 Supabase，一併移除（體型、任務跟著 cascade）；只有內建清單的話這行不會動到任何資料
delete from public.meow_cat_models where id = 'cat_20261101_183700' and owner_type = 'template';
