-- 雙體型（0016）上線後，「確認使用」只寫進 meow_cat_model_variants，主表 profile.confirmed_albedo 沒跟著更新，
-- 首頁待辦、儀表板讀主表，已確認的貓一直顯示「3/4 待確認」。主表指向的貼圖在體型表已確認者，補寫主表。
-- 0027；執行前須經 Tina 確認。可重複執行。
update public.meow_cat_models m
set profile = coalesce(m.profile, '{}'::jsonb) || jsonb_build_object('confirmed_albedo', v.confirmed_albedo)
from public.meow_cat_model_variants v
where v.model_id = m.id
  and m.albedo_path is not null
  and v.albedo_path = m.albedo_path
  and v.confirmed_albedo = m.albedo_path
  and m.profile->>'confirmed_albedo' is distinct from v.confirmed_albedo;
