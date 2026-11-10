import { NextResponse } from "next/server";
import { AI_LIMITS, checkInput } from "@/lib/ai/guard";
import { embedTexts, parseFindQuery } from "@/lib/ai/server";
import {
  FIND_SELECT, catText, conditionLabels, emptyConditions, keywordConditions, mergeConditions, queryText, rankCats, ruleReason, textHash, toHomeProfile,
  type FindCatRow, type HomeProfile, type Scope,
} from "@/lib/find-cats";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { photoSrc } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";

// 幫我找貓（規格 docs/spec/11）：一句話（可以空白）＋自己家喵戶的資料 → 推薦的待領養貓與為什麼推薦。
// - 貓用登入者身分讀（RLS：只會讀到待領養、公開的），喵戶只讀自己的一般飼主喵戶。
// - 意思座標存在 meow_cat_embeddings（0032），只有伺服器讀寫；介紹文字的雜湊不同或換了模型才重算。
// - 不儲存使用者打的那句話，也不存查詢向量。AI 沒回應時改用關鍵字條件、標籤分數排序與規則組的理由。
// - 推薦理由先用規則組的句子回傳，畫面再用 need＋前幾名的 id 呼叫 /api/find/reasons 換成 AI 寫的，結果不用等 AI 寫完才出現。

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { q?: unknown; scope?: unknown } | null;
  const scope: Scope = body?.scope === "all" ? "all" : "city";
  const raw = typeof body?.q === "string" ? body.q : "";
  let q = "";
  if (raw.trim()) {
    const input = checkInput(raw, AI_LIMITS.findChars);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    q = input.text;
  }

  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ error: "還沒連接資料庫" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();

  let home: HomeProfile | null = null;
  if (auth.user) {
    const { data: h } = await sb.from("meow_households").select("city, district, home").eq("owner_id", auth.user.id)
      .eq("caretaker_type", "cat_owner").order("created_at").limit(1).maybeSingle();
    if (h) home = toHomeProfile(h);
  }
  // 沒打字、也沒有自己家的喵戶：請他先描述需求
  if (!q && !home) return NextResponse.json({ needQuery: true });

  const parsed = q ? (await parseFindQuery(q)) ?? keywordConditions(q) : emptyConditions();
  const merged = mergeConditions(parsed, home);
  const c = merged.conditions;

  const { data: cats } = await sb.from("meow_cats").select(FIND_SELECT).eq("status", "adoptable").order("created_at").limit(200);
  const rows = (cats ?? []) as unknown as FindCatRow[];

  // 先用範圍與排除留下候選，只為候選算意思座標
  const pool = rankCats(rows, c, { scope, queryVec: null, vectors: new Map(), limit: 200 }).results.map(r => r.row);
  const texts = new Map(pool.map(r => [r.id, catText(r)]));
  const admin = getAdminSupabase();
  const { data: stored } = admin && pool.length
    ? await admin.from("meow_cat_embeddings").select("cat_id, model, content_hash, embedding").in("cat_id", pool.map(r => r.id))
    : { data: [] as { cat_id: string; model: string; content_hash: string; embedding: number[] }[] };

  const qText = queryText(c, home);
  const probe = await embedTexts([qText]);
  const vectors = new Map<string, number[]>();
  let queryVec: number[] | null = null;
  if (probe) {
    queryVec = probe.vectors[0] ?? null;
    const stale = pool.filter(r => {
      const s = stored?.find(x => x.cat_id === r.id);
      if (s && s.model === probe.key && s.content_hash === textHash(texts.get(r.id)!)) { vectors.set(r.id, s.embedding); return false; }
      return true;
    });
    if (stale.length) {
      const fresh = await embedTexts(stale.map(r => texts.get(r.id)!));
      if (fresh && fresh.key === probe.key) {
        stale.forEach((r, i) => vectors.set(r.id, fresh.vectors[i]));
        // 存起來，下次搜尋不用再算；沒有 service role 時就只用這一次
        if (admin) {
          await admin.from("meow_cat_embeddings").upsert(stale.map((r, i) => ({
            cat_id: r.id, model: fresh.key, content_hash: textHash(texts.get(r.id)!), embedding: fresh.vectors[i], updated_at: new Date().toISOString(),
          })));
        }
      } else queryVec = null; // 貓的座標算不出來就整批改用備案，避免一半有分數一半沒有
    }
  }

  const ranked = rankCats(pool, c, { scope, queryVec, vectors });

  return NextResponse.json({
    scope: ranked.scope,
    city: ranked.city,
    conditionCity: c.city,
    labels: conditionLabels(merged, ranked.scope),
    usedHome: Boolean(home),
    fromHomeOnly: !q,
    semantic: Boolean(queryVec),
    need: qText,
    results: ranked.results.map(r => ({
      ...r.cat,
      // 封面：舊欄位 photo_url 沒有時，用照片的第一張（和貓咪頁一樣）
      photo: r.cat.photo ?? (r.row.photo_paths?.[0] ? photoSrc(sb, r.row.photo_paths[0]) : null),
      reason: ruleReason(r.row, c),
    })),
  });
}
