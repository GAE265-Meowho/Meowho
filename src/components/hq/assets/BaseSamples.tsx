"use client";
// 母體範本（#88）：成貓、幼貓兩個共用母體（網格＋骨架＋全部動作），用母體自己的預設貼圖播放。
// 上傳的貓依年齡套其中一個（≤6 個月幼貓），只換貼圖，動作、骨架都跟這裡一樣。
import dynamic from "next/dynamic";
import { useState } from "react";
import { CLIP_LIBRARY, FALLBACK_CLIP } from "@/lib/hq/cat-models/clips";
import { BODY_LABELS, KITTEN_MAX_MONTHS, type BodyType } from "@/lib/hq/cat-models/types";
import { HqSkeleton } from "../HqStates";
import { baseGlbUrl } from "./useCatModels";

const CatPreview = dynamic(() => import("./CatPreview"), { ssr: false, loading: () => <HqSkeleton rows={4} /> });
const READY_CLIPS = CLIP_LIBRARY.filter(c => c.status === "ready");
const BODIES: { body: BodyType; rule: string }[] = [
  { body: "adult", rule: `${KITTEN_MAX_MONTHS} 個月以上或沒填年齡` },
  { body: "kitten", rule: `${KITTEN_MAX_MONTHS} 個月以下` },
];

function BaseSample({ body, rule }: { body: BodyType; rule: string }) {
  const [clip, setClip] = useState(FALLBACK_CLIP);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <section className="hq-box" aria-label={`${BODY_LABELS[body]}母體`}>
      <h3>{BODY_LABELS[body]}母體</h3>
      <p className="hq-hint">上傳的貓 {rule} 會用這個骨架，只換成自己的貼圖。</p>
      {failed ? (
        <div className="hq-state" role="alert"><p>3D 預覽載入失敗</p><p className="hq-hint">{failed}</p></div>
      ) : (
        <div className="hq-canvas small" data-testid={`base-canvas-${body}`}>
          <CatPreview baseUrl={baseGlbUrl(body)} body={body} albedoUrl={null} clip={clip} onError={e => setFailed(e.message || "未知錯誤")} />
        </div>
      )}
      <div className="hq-row" role="group" aria-label="動作">
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
      <summary>母體範本（成貓／幼貓骨架與動作）</summary>
      <div className="hq-cards">
        {BODIES.map(b => <BaseSample key={b.body} {...b} />)}
      </div>
    </details>
  );
}
