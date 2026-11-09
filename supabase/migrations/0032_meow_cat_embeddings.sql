-- 0032 幫我找貓（規格 11）：每隻貓一筆「意思座標」（Embedding），搜尋時依意思相近程度排序。
-- 向量存成一般的 real[]，相似度在伺服器算（貓只有幾十隻，全部比一次就夠快），所以不需要 pgvector 擴充，物件都是 meow_ 開頭。
-- 座標只由伺服器（service role）寫入與讀取：前端角色沒有任何權限，也沒有 policy。
-- 「介紹文字」只用貓咪頁公開的欄位組成（src/lib/find-cats.ts 的 catText），內容雜湊不同或換了模型才重算。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。
create table if not exists public.meow_cat_embeddings (
  cat_id uuid primary key references public.meow_cats (id) on delete cascade,
  model text not null check (char_length(btrim(model)) between 1 and 100),
  content_hash text not null check (char_length(content_hash) between 1 and 100),
  embedding real[] not null check (cardinality(embedding) between 64 and 4096),
  updated_at timestamptz not null default now()
);

alter table public.meow_cat_embeddings enable row level security;
revoke all on public.meow_cat_embeddings from anon, authenticated;
