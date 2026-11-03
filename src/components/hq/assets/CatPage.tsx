"use client";
// 貓咪頁（規格書 04 §2.4）：每隻貓獨立一頁，看這隻貓的動作。上架／下架已移除（#100）。
// 版面（#129）：原貓咪資訊 : 3D 動作預覽 : 播放與畫面 ＝ 1:2:1。
// #129：預覽用「已確認」的紋理貼圖；新貼圖確認前、重新產生期間都繼續用舊的，前台不會突然沒有貓。
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatTaipeiDate } from "@/lib/hq/actions";
import { resolveClip } from "@/lib/hq/cat-models/clips";
import {
  BODY_LABELS, FILL_LABELS, GEN_VIEWS, GEN_VIEW_LABELS, PHOTO_VIEW_LABELS, textureOf, type BodyType, type CatModelView,
} from "@/lib/hq/cat-models/types";
import { HqLoadError, HqSkeleton } from "../HqStates";
import { HqNotFound } from "../HqLoginPage";
import type { PreviewInfo } from "./CatPreview";
import { EXTRA_SLOTS } from "./AiViews";
import { ClipList } from "./ClipList";
import { PanelGroup } from "./PanelGroup";
import { ASSETS_CATS_HREF, studioHref } from "./hrefs";
import { baseGlbUrl, catFileUrl, useCat } from "./useCatModels";
import { defaultBody } from "./catLook";

const GEN_KIND = { left: "gen_left", front: "gen_front", back: "gen_back" } as const;

/** 已產生的 AI 三視角（唯讀；重新產生在製作glb工作區） */
function GeneratedViews({ cat }: { cat: CatModelView }) {
  return (
    <PanelGroup title="AI 三視角">
      {cat.aiViews.length ? (
        <div className="hq-cat-gens">
          {GEN_VIEWS.map(v => (
            <figure key={v}>
              {cat.aiViews.includes(v) ? (
                <a href={catFileUrl(cat.id, GEN_KIND[v], cat.updatedAt)} target="_blank" rel="noreferrer" aria-label={`放大看${GEN_VIEW_LABELS[v]}照片`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={catFileUrl(cat.id, GEN_KIND[v], cat.updatedAt)} alt={`${GEN_VIEW_LABELS[v]}照片`} />
                </a>
              ) : <div className="hq-cat-gens-empty">尚未產生</div>}
              <figcaption>{GEN_VIEW_LABELS[v]}</figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="hq-hint">還沒有產生 AI 三視角。</p>}
    </PanelGroup>
  );
}

/** 3D 預覽目前使用的（已確認）紋理貼圖 */
function TextureCard({ url, body }: { url: string | null; body: BodyType }) {
  return (
    <PanelGroup title="貓咪紋理">
      {url ? (
        <figure className="hq-texture-preview" style={{ margin: 0 }}>
          <a href={url} target="_blank" rel="noreferrer" aria-label="放大看紋理貼圖">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${BODY_LABELS[body]}紋理貼圖`} />
          </a>
          <figcaption>{BODY_LABELS[body]}・已確認・點圖放大</figcaption>
        </figure>
      ) : <p className="hq-hint">還沒有{BODY_LABELS[body]}的紋理貼圖。</p>}
    </PanelGroup>
  );
}

const CatPreview = dynamic(() => import("./CatPreview"), { ssr: false, loading: () => <HqSkeleton rows={4} /> });

function Preview({ cat }: { cat: CatModelView }) {
  const router = useRouter();
  const params = useSearchParams();
  const [info, setInfo] = useState<PreviewInfo | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [textureFailed, setTextureFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [blink, setBlink] = useState(0);
  const [pupil, setPupil] = useState(0.25);
  const [light, setLight] = useState(1);
  const [follow, setFollow] = useState(true);
  const [viewKey, setViewKey] = useState(0);
  const [selectedBody, setSelectedBody] = useState<BodyType>(() => defaultBody(cat));

  const clips = info?.clips ?? [];
  const clip = info ? resolveClip(params.get("clip"), clips) : null;
  const pick = useCallback((code: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("clip", code);
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [params, router]);

  const variant = cat.variantStorage ? cat.bodyVariants?.[selectedBody] : undefined;
  const texture = cat.variantStorage ? variant?.texture ?? null : textureOf(cat);
  const ready = texture?.preview !== null && texture?.preview !== undefined;
  const body = cat.variantStorage ? selectedBody : texture?.previewBody ?? cat.body;
  const albedoUrl = !textureFailed && texture?.preview
    ? variant ? (texture.preview === "albedo" ? variant.albedoUrl : variant.prevUrl)
      : catFileUrl(cat.id, texture.preview, cat.albedoVersion ?? undefined)
    : null;

  function selectBody(next: BodyType) {
    setSelectedBody(next);
    setInfo(null);
    setFailed(null);
    setTextureFailed(false);
    setViewKey(value => value + 1);
  }

  return (
    <div className="hq-catpage">
      <section className="hq-catinfo" aria-label="原貓咪資訊">
        <PanelGroup title="原貓咪資訊">
          <div className="hq-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hq-thumb" src={catFileUrl(cat.id, "photo")} alt={`${cat.name} 的原始照片`} width={96} height={96} />
            <dl className="hq-dl">
              <dt>體型骨架</dt><dd>{BODY_LABELS[body]}骨架</dd>
              <dt>照片角度</dt><dd>{cat.photoView ? PHOTO_VIEW_LABELS[cat.photoView] : "—"}</dd>
              <dt>補花紋</dt><dd>{cat.fillPattern ? FILL_LABELS[cat.fillPattern] : "—"}</dd>
              <dt>建立時間</dt><dd>{formatTaipeiDate(new Date(cat.createdAt))}</dd>
            </dl>
          </div>
          {EXTRA_SLOTS.some(x => cat.extraPhotos.includes(x.view)) && (
            <div className="hq-row" aria-label="其他角度照片">
              {EXTRA_SLOTS.filter(x => cat.extraPhotos.includes(x.view)).map(x => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={x.view} className="hq-thumb" src={catFileUrl(cat.id, x.kind)} alt={x.label} width={72} height={72} />
              ))}
            </div>
          )}
        </PanelGroup>
        <GeneratedViews cat={cat} />
        <TextureCard url={texture?.preview ? albedoUrl : null} body={body} />
      </section>

      <section className="hq-catstage" aria-label="3D 預覽">
        {cat.variantStorage && <div className="hq-chips" role="group" aria-label="預覽體型">
          {(["adult", "kitten"] as const).map(choice => <button key={choice} type="button" aria-pressed={body === choice}
            className={body === choice ? "on" : ""} onClick={() => selectBody(choice)}>{BODY_LABELS[choice]}</button>)}
        </div>}
        {/* #118：還沒製作 glb 時不載入骨架示範貓；CatPage 會直接轉到製作glb工作區，這裡只是轉頁前的過渡 */}
        {!ready ? (
          <div className="hq-state hq-noglb" role="status">
            <p>還沒有{BODY_LABELS[body]}的紋理貼圖。</p>
            <Link href={`${studioHref(cat.id)}?body=${body}`} className="hq-btn">前往製作{BODY_LABELS[body]}貼圖</Link>
          </div>
        ) : (
          <>
            {textureFailed ? (
              <div className="hq-state" role="alert">貼圖載入失敗，請重新整理後再試。</div>
            ) : failed ? (
              <div className="hq-state" role="alert">
                <p>3D 預覽載入失敗</p>
                <p className="hq-hint">{failed}。請確認{BODY_LABELS[body]}骨架 glb 已上傳（本機：CAT_STUDIO_ROOT 底下的 {body === "kitten" ? "cat_base_kitten" : "cat_base"}/work/base_clips.glb）。</p>
              </div>
            ) : (
              <div className="hq-canvas" data-testid="cat-canvas">
                <CatPreview
                  key={viewKey} baseUrl={baseGlbUrl(body)} body={body} albedoUrl={albedoUrl} clip={clip}
                  speed={speed} paused={paused} blink={blink} pupil={pupil} light={light} follow={follow}
                  onInfo={setInfo} onTextureError={() => setTextureFailed(true)} onError={e => setFailed(e.message || "未知錯誤")}
                />
              </div>
            )}
            {info && (
              <p className="hq-hint" role="status">
                {info.eyes} 顆眼球、{info.bones} 根骨頭
                {info.morphs.length > 0 && `、形狀鍵 ${info.morphs.join(" / ")}`}
              </p>
            )}
          </>
        )}
      </section>

      <section className="hq-catside" aria-label="參數">
        {ready && (
          <>
            <PanelGroup title="播放與畫面">
              <div className="hq-row">
                <button type="button" className="hq-btn ghost small" onClick={() => setPaused(p => !p)}>{paused ? "播放" : "暫停"}</button>
                <div className="hq-chips" role="group" aria-label="播放速度">
                  {[0.5, 1, 1.5].map(s => (
                    <button key={s} type="button" className={speed === s ? "on" : ""} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
                  ))}
                </div>
                <button type="button" className="hq-btn ghost small" onClick={() => setViewKey(k => k + 1)}>重設視角</button>
              </div>
              <label className="hq-slider"><span>眨眼 {blink.toFixed(2)}</span>
                <input type="range" min={0} max={1} step={0.01} value={blink} onChange={e => setBlink(+e.target.value)} /></label>
              <label className="hq-slider"><span>瞳孔寬窄 {pupil.toFixed(2)}</span>
                <input type="range" min={0} max={1} step={0.01} value={pupil} onChange={e => setPupil(+e.target.value)} /></label>
              <label className="hq-slider"><span>環境亮度 {light.toFixed(2)}</span>
                <input type="range" min={0.2} max={2.5} step={0.01} value={light} onChange={e => setLight(+e.target.value)} /></label>
              <label className="hq-check"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> 眼睛看游標</label>
            </PanelGroup>
            <PanelGroup title="動作">
              <ClipList available={clips} current={clip} onPick={pick} />
              <Link href={studioHref(cat.id)} className="hq-btn ghost small">製作glb工作區</Link>
              <p className="hq-hint">灰色的是規劃中的動作，骨架補入後會自動可點。</p>
            </PanelGroup>
          </>
        )}
      </section>
    </div>
  );
}

/** #118：還沒有 3D（#129：還沒有確認過的紋理貼圖）的貓直接進製作glb工作區（從列表點進來或直接開網址都一樣） */
function GoStudio({ cat }: { cat: CatModelView }) {
  const router = useRouter();
  const ready = cat.variantStorage
    ? (["adult", "kitten"] as const).some(body => Boolean(cat.bodyVariants?.[body]?.texture.preview))
    : textureOf(cat).preview !== null;
  useEffect(() => { if (!ready) router.replace(studioHref(cat.id)); }, [ready, cat.id, router]);
  return null;
}

export function CatPage({ id }: { id: string }) {
  const { value, reload } = useCat(id);

  if (value.state === "loading") return <HqSkeleton rows={4} />;
  if (value.state === "missing") return <HqNotFound />;
  if (value.state === "error") return <HqLoadError onRetry={reload} />;
  if (value.state === "disabled") {
    return <div className="hq-state"><p>貓咪模型的資料來源還沒有啟用。</p><Link href={ASSETS_CATS_HREF}>回到列表</Link></div>;
  }
  const cat = value.data;
  return (
    <>
      <GoStudio cat={cat} />
      <div className="hq-pagehead">
        <Link href={ASSETS_CATS_HREF} className="hq-back">← 虛擬體驗元件管理</Link>
        <h1 className="hq-h1">{cat.name}</h1>
      </div>
      <Preview cat={cat} />
    </>
  );
}
