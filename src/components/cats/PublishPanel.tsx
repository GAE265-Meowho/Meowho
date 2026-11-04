"use client";
// 中途的貓咪頁（規格 09 §5.1、§5.2）：3D 貓預覽與確認、「準備出發找新主人」的兩項檢查。只有這隻貓的中途看得到。
// 寫入都走 0017 的資料庫函式（meow_confirm_cat_model、meow_publish_cat），資料庫會再檢查一次。
// 3D 貓目前是預設 3D 貓（母體＋預設貼圖），由 /api/cats/[id]/model 建立；接真正流程見 lib/cat-publish.ts。
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { DEFAULT_ALBEDO, bodyOf, publishChecklist, type PublishCheck } from "@/lib/cat-publish";
import { baseFileName } from "@/lib/hq/cat-models/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { AiViewsPreview } from "./AiViewsPreview";
import s from "./catPage.module.css";

const CatPreview = dynamic(() => import("@/components/hq/assets/CatPreview"), { ssr: false, loading: () => <div className={s.modelBox} /> });

type Model = { albedo: string | null; confirmed: boolean } | null;

const ERRORS: Record<string, string> = {
  cat_model_not_confirmed: "3D 模型還沒確認。",
  cat_tasks_not_ready: "任務還沒完成。",
  cat_not_preparing: "這隻貓已經出發了。",
};
const errText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? `操作失敗：${m}`;

export function PublishPanel({ catId, catName, lifeStage, status }: { catId: string; catName: string; lifeStage: string | null; status: string }) {
  const sb = getBrowserSupabase();
  const body = bodyOf(lifeStage);
  const [model, setModel] = useState<Model | undefined>(undefined);
  const [check, setCheck] = useState<PublishCheck | null | undefined>(undefined);
  const [askDefault, setAskDefault] = useState(false);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const [{ data: m }, { data: c }] = await Promise.all([
      sb.from("meow_cat_models").select("id, variants:meow_cat_model_variants(body_type, albedo_path, confirmed_albedo)").eq("cat_id", catId).maybeSingle(),
      sb.rpc("meow_cat_publish_check", { p_cat_id: catId }),
    ]);
    setCheck((c as PublishCheck | null) ?? null);
    const v = (m?.variants as { body_type: string; albedo_path: string | null; confirmed_albedo: string | null }[] | undefined)?.find(x => x.body_type === body);
    setModel(v?.albedo_path ? { albedo: v.albedo_path, confirmed: Boolean(v.confirmed_albedo) } : null);
    return Boolean(m);
  }, [sb, catId, body]);

  // 還沒有 3D 貓：請伺服器建立（建立 profile 時已經建過，這裡補舊的貓或失敗的情況）
  useEffect(() => {
    load().then(has => {
      if (has === false) fetch(`/api/cats/${catId}/model`, { method: "POST" }).then(() => load()).catch(() => undefined);
    });
  }, [load, catId]);

  async function rpc(fn: string): Promise<boolean> {
    if (!sb) return false;
    setBusy(true); setError(null);
    const { error: err } = await sb.rpc(fn, { p_cat_id: catId });
    setBusy(false);
    if (err) { setError(errText(err.message)); return false; }
    return true;
  }

  async function publish() {
    if (await rpc("meow_publish_cat")) { setAskDefault(false); setPublished(true); }
  }

  if (published) return (
    <section className={`${f.card} ${f.center}`} aria-labelledby="sec-published">
      <h2 id="sec-published">{catName}出發找新主人了！</h2>
      <p className={f.lead}>大家現在看得到牠，也可以進行牠的領養任務。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton onClick={() => window.location.reload()}>到前台看看</CatButton>
      </div>
    </section>
  );

  const list = publishChecklist(check ?? null, catId);
  const preparing = status === "preparing";

  return (
    <>
      <section className={f.card} id="model" aria-labelledby="sec-model">
        <h2 id="sec-model">3D 模型</h2>
        {model === undefined ? <p className={f.lead} role="status">載入中…</p>
          : model === null ? <p className={f.lead} role="status">正在準備{catName}的 3D 模型…</p>
          : (
            <>
              <div className={s.modelBox}>
                <CatPreview baseUrl={`/hq-cat-models/base/${baseFileName(body)}`} body={body} albedoUrl={model.albedo === DEFAULT_ALBEDO ? null : model.albedo} clip="idle" />
              </div>
              {model.confirmed
                ? <p className={s.done}><Icon name="check" size={18} />{catName}的 3D 模型準備好了。</p>
                : (
                  <>
                    <p className={f.lead}>{catName}的 3D 模型做好了，看看像不像牠。</p>
                    <div className={f.actions}>
                      <CatButton size="sm" disabled={busy} onClick={async () => { if (await rpc("meow_confirm_cat_model")) load(); }}>確認使用</CatButton>
                    </div>
                  </>
                )}
            </>
          )}
      </section>

      <AiViewsPreview catId={catId} catName={catName} />

      {preparing && (
        <section className={f.card} aria-labelledby="sec-publish">
          <h2 id="sec-publish">準備出發找新主人</h2>
          <ul className={s.checks}>
            <li className={check?.model_confirmed ? s.ok : ""}><Icon name={check?.model_confirmed ? "check" : "cat"} size={18} />3D 模型已確認</li>
            <li className={check?.tasks_ready ? s.ok : ""}><Icon name={check?.tasks_ready ? "check" : "cat"} size={18} />任務完成</li>
          </ul>
          {list.missing.length > 0 && (
            <p className={f.lead}>還差：{list.missing.map((m, i) => <span key={m.key}>{i > 0 && "、"}<a href={m.href}>{m.label}</a></span>)}</p>
          )}
          {askDefault ? (
            <>
              <p className={f.lead}>{catName}目前用的是系統預設任務。花 10 分鐘建立專屬任務，會更容易遇到合適的主人。</p>
              <div className={f.actions}>
                <CatButton size="sm" disabled={busy} onClick={publish}>先出發</CatButton>
                <CatButton variant="ghost" size="sm" href={`/cats/${catId}/tasks`}>去建立任務</CatButton>
              </div>
            </>
          ) : (
            <div className={f.actions}>
              <CatButton disabled={!list.canPublish || busy} onClick={() => (list.usesDefault ? setAskDefault(true) : publish())}>準備出發找新主人</CatButton>
            </div>
          )}
        </section>
      )}

      {/* 用系統預設任務出發的貓，持續提示建立專屬任務（規格 09 §5.2） */}
      {!preparing && list.usesDefault && (
        <section className={f.card} aria-labelledby="sec-tasks-tip">
          <h2 id="sec-tasks-tip">建立專屬任務</h2>
          <p className={f.lead}>為{catName}量身打造任務，最能幫牠找到合適的主人。</p>
          <div className={f.actions}><CatButton size="sm" href={`/cats/${catId}/tasks`}>建立專屬任務</CatButton></div>
        </section>
      )}
      {!preparing && check?.tasks_ready === false && status === "adoptable" && (
        <section className={f.card} aria-labelledby="sec-tasks-tip2">
          <h2 id="sec-tasks-tip2">出領養任務</h2>
          <p className={f.lead}>為{catName}量身打造任務，最能幫牠找到合適的主人。</p>
          <div className={f.actions}><CatButton size="sm" href={`/cats/${catId}/tasks`}>建立專屬任務</CatButton></div>
        </section>
      )}
      {error && <p className={f.error} role="alert">{error}</p>}
    </>
  );
}
