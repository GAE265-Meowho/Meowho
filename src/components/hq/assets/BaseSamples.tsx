"use client";
// 體型骨架（#88，程式內仍叫「母體」）：成貓、幼貓兩個共用母體（網格＋骨架＋全部動作），用母體自己的預設貼圖播放。
// 上傳的貓依年齡自動套其中一個（≤6 個月幼貓），只換貼圖，動作、骨架都跟這裡一樣。
// 畫面上改叫「體型骨架」：後台使用者不懂「母體」，而且容易誤以為要從這兩隻裡挑一隻（其實是系統自動套用）。
import dynamic from "next/dynamic";
import { useState } from "react";
import { CLIP_LIBRARY, FALLBACK_CLIP } from "@/lib/hq/cat-models/clips";
import { BODY_LABELS, KITTEN_MAX_MONTHS, type BodyType } from "@/lib/hq/cat-models/types";
import { HqSkeleton } from "../HqStates";
import { baseGlbUrl } from "./useCatModels";

const CatPreview = dynamic(() => import("./CatPreview"), { ssr: false, loading: () => <HqSkeleton rows={4} /> });
const READY_CLIPS = CLIP_LIBRARY.filter(c => c.status === "ready");
const BODIES: { body: BodyType; tags: string[]; desc: string }[] = [
  { body: "adult", tags: [`${KITTEN_MAX_MONTHS} 個月以上`, "未填年齡時預設"], desc: "標準成貓比例。" },
  { body: "kitten", tags: [`${KITTEN_MAX_MONTHS} 個月以下`], desc: "頭大身短的幼貓比例。" },
];

function BaseSample({ body, tags, desc }: { body: BodyType; tags: string[]; desc: string }) {
  const [clip, setClip] = useState(FALLBACK_CLIP);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <section className="hq-box hq-base" aria-label={`${BODY_LABELS[body]}骨架`}>
      <div className="hq-base-head">
        <h3>{BODY_LABELS[body]}骨架</h3>
        <span className="hq-row">{tags.map(t => <span key={t} className="hq-tag">{t}</span>)}</span>
      </div>
      <p className="hq-hint">{desc}動作與骨架固定，只換成上傳貓咪的毛色。</p>
      {failed ? (
        <div className="hq-state" role="alert"><p>3D 預覽載入失敗</p><p className="hq-hint">{failed}</p></div>
      ) : (
        <div className="hq-canvas small hq-base-canvas" data-testid={`base-canvas-${body}`}>
          <span className="hq-tag mute hq-canvas-badge">示範毛色</span>
          <CatPreview baseUrl={baseGlbUrl(body)} body={body} albedoUrl={null} clip={clip} onError={e => setFailed(e.message || "未知錯誤")} />
        </div>
      )}
      <div className="hq-row hq-clipbar" role="group" aria-label="動作">
        <span className="hq-hint">動作預覽</span>
        {READY_CLIPS.map(c => (
          <button key={c.code} type="button" className={`hq-btn small${c.code === clip ? "" : " ghost"}`}
            aria-pressed={c.code === clip} onClick={() => setClip(c.code)}>{c.label}</button>
        ))}
      </div>
    </section>
  );
}

export function BaseSamples() {
  return (
    <details className="hq-bases" open>
      <summary>
        <span>體型骨架</span>
        <span className="hq-tag">系統自動套用</span>
      </summary>
      <p className="hq-hint hq-bases-lead">
        每隻 3D 貓咪都由下面其中一個骨架做成：<strong>骨架決定體型與動作，照片決定毛色</strong>。
        不用自己選，系統會依填寫的年齡自動套用。
      </p>
      <div className="hq-cards">
        {BODIES.map(b => <BaseSample key={b.body} {...b} />)}
      </div>
    </details>
  );
}
