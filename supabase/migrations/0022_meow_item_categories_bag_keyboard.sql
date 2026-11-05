-- 生活用品類別：包包、鍵盤（AI 不讀）；杯子、花瓶、筆記本亦可手動上傳自訂 glb（AI 已能讀圖辨識同名小物）
-- 虛擬體驗可放地板或書桌桌面。執行前須 Tina 確認。

insert into public.meow_item_categories (id, name, sort_order) values
  ('bags', '包包', 5),
  ('keyboards', '鍵盤', 6),
  ('cups', '杯子', 7),
  ('vases', '花瓶', 8),
  ('notebooks', '筆記本', 9)
on conflict (id) do nothing;
