-- MeowHQ｜平面圖戶名唯一（Issue #259）
-- 共用專案規則（AGENTS.md §7）：只修改 meow_ 開頭的物件；可重複執行。
-- ⚠ 執行前須經 Tina 確認（AGENTS.md §7.4）。
-- 根因：createHouse 先 SELECT 再 INSERT，並發請求可能同時通過檢查而寫出同名戶。
-- 策略：保留最早一筆原名；較晚的同名戶改成「截短原名·id 尾碼」（不刪列、不碰房間與原圖）；
-- 再加 partial unique index（只約束 source = 'floorplan'），影片轉換不受影響。

-- 1. 既有重複：同名平面圖戶只留最早建立的那筆名稱
with ranked as (
  select id, name,
    row_number() over (partition by name order by created_at asc, id asc) as rn
  from public.meow_room_models
  where source = 'floorplan'
)
update public.meow_room_models m
set name = left(btrim(m.name), greatest(1, 40 - 1 - char_length(right(m.id, 6))))
            || '·' || right(m.id, 6),
    updated_at = now()
from ranked r
where m.id = r.id and r.rn > 1
  and m.name = r.name;

-- 2. 平面圖戶名唯一（影片 source = 'video' 不套用）
create unique index if not exists meow_room_models_floorplan_name_uidx
  on public.meow_room_models (name)
  where source = 'floorplan';
