"use client";
// 貓咪頁（規格書 04 §2.4）：每隻貓獨立一頁，看這隻貓的動作。上架／下架已移除（#100）。
// 版面（#96）：左側預覽固定，右側參數面板分為播放與畫面、動作、資訊，可獨立捲動。
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatTaipeiDate } from "@/lib/hq/actions";
import { resolveClip } from "@/lib/hq/cat-models/clips";
import {
  BODY_LABELS, FILL_LABELS, PHOTO_VIEW_LABELS, type CatModelView,
} from "@/lib/hq/cat-models/types";
import { HqLoadError, HqSkeleton } from "../HqStates";
import { HqNotFound } from "../HqLoginPage";
import type { PreviewInfo } from "./CatPreview";
import { EXTRA_SLOTS } from "./AiViews";
import { ClipList } from "./ClipList";
import { PanelGroup } from "./PanelGroup";
import { ASSETS_CATS_HREF, studioHref } from "./hrefs";
import { baseGlbUrl, catFileUrl, useCat } from "./useCatModels";

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

  const clips = info?.clips ?? [];
  const clip = info ? resolveClip(params.get("clip"), clips) : null;
  const pick = useCallback((code: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("clip", code);
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [params, router]);

  const albedoUrl = cat.hasAlbedo && !textureFailed ? catFileUrl(cat.id, "albedo", cat.albedoVersion ?? undefined) : null;

  return (
    <div className="hq-catpage">
      <section className="hq-catstage" aria-label="3D 預覽">
        {/* #118：還沒製作 glb 時不載入骨架示範貓；CatPage 會直接轉到製作glb工作區，這裡只是轉頁前的過渡 */}
        {!cat.hasAlbedo ? (
          <div className="hq-state hq-noglb" role="status">
            <p>這隻貓還沒有 3D 模型，前往製作glb工作區…</p>
            <Link href={studioHref(cat.id)} className="hq-btn">進入glb製作區</Link>
          </div>
        ) : (
          <>
            {textureFailed && <div className="hq-note" role="alert">貼圖載入失敗，改顯示骨架的示範毛色。</div>}
            {failed ? (
              <div className="hq-state" role="alert">
                <p>3D 預覽載入失敗</p>
                <p className="hq-hint">{failed}。請確認{BODY_LABELS[cat.body]}骨架 glb 已上傳（本機：CAT_STUDIO_ROOT 底下的 {cat.body === "kitten" ? "cat_base_kitten" : "cat_base"}/work/base_clips.glb）。</p>
              </div>
            ) : (
              <div className="hq-canvas" data-testid="cat-canvas">
                <CatPreview
                  key={viewKey} baseUrl={baseGlbUrl(cat.body)} body={cat.body} albedoUrl={albedoUrl} clip={clip}
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
        {cat.hasAlbedo && (
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
        <PanelGroup title="資訊">
          <div className="hq-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hq-thumb" src={catFileUrl(cat.id, "photo")} alt={`${cat.name} 的原始照片`} width={96} height={96} />
            <dl className="hq-dl">
              <dt>體型骨架</dt><dd>{BODY_LABELS[cat.body]}骨架</dd>
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
      </section>
    </div>
  );
}

/** #118：還沒有 3D 的貓直接進製作glb工作區（從列表點進來或直接開網址都一樣） */
function GoStudio({ cat }: { cat: CatModelView }) {
  const router = useRouter();
  useEffect(() => { if (!cat.hasAlbedo) router.replace(studioHref(cat.id)); }, [cat.hasAlbedo, cat.id, router]);
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
