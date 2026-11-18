"use client";
/* eslint-disable @next/next/no-img-element */
// 前導影片：產生影片（#493）。每格 AI 分鏡一張卡：起始畫面（該格分鏡圖）、要掛的參考圖、剪接／生成長度、圖生影片 prompt。
// 系統錄影與剪輯字卡不用生成，不列。資料在 src/lib/hq/videos/clips.ts。
import { NEGATIVE_PROMPT, clipSections, motionPrompt, startFrameFileName, type ClipItem } from "@/lib/hq/videos/clips";
import { frameCounts } from "@/lib/hq/videos/trailer";
import { GenLogButton, useGenLogs } from "./GenLog";
import { DownloadRef, Prompt, RefChips, useCopy, useTrailerUploads, type SlotProps } from "./TrailerBoard";

const LINE_LABEL: Record<string, string> = { 貓: "貓線", 人: "人線", 匯: "匯聚", 產品: "產品" };

export function ClipsBoard() {
  const { uploads, urlOf } = useTrailerUploads();
  const copy = useCopy();
  const genLogs = useGenLogs();
  const sections = clipSections();
  const items = sections.flatMap(s => s.items);
  const ready = items.filter(i => uploads[i.frame.id]).length;
  const counts = frameCounts();

  return (
    <div className="hq-video">
      <section className="hq-video-sec" aria-labelledby="clip-how">
        <h2 id="clip-how">怎麼產生影片</h2>
        <ol className="hq-video-steps">
          <li>到「前導影片：分鏡」上傳這一格的分鏡圖，以及要掛的定角、定景照。</li>
          <li>下載起始畫面（分鏡圖）和參考圖，檔名就是 prompt 裡寫的檔名。</li>
          <li>在圖生影片工具（例如 Kling）放上起始畫面，依序掛上參考圖，貼上這一格的 prompt 和下方的負面 prompt，選建議的生成長度。</li>
          <li>剪接時依「成片用幾秒」裁切。</li>
        </ol>
        <p className="hq-sub">
          要生成 {items.length} 段（AI 分鏡），起始畫面已上傳 {ready}／{items.length}。系統錄影 {counts.record} 格、剪輯字卡 {counts.edit} 格不用生成。
        </p>
        <Prompt text={NEGATIVE_PROMPT} copy={copy} title="負面 prompt（每一格共用）" />
      </section>

      {sections.map(sec => (
        <section key={sec.title} className="hq-video-sec" aria-label={sec.title}>
          <div className="hq-video-sechead">
            <h2>{sec.title}<span className="hq-sub">（{sec.range}）</span></h2>
            <GenLogButton section={sec} state={genLogs} copy={copy} />
          </div>
          <div className="hq-video-clips">
            {sec.items.map(item => <ClipCard key={item.frame.id} item={item} urlOf={urlOf} copy={copy} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function ClipCard({ item, urlOf, copy }: { item: ClipItem; urlOf: SlotProps["urlOf"]; copy: (t: string) => void }) {
  const { shot, frame, cut, generate } = item;
  const url = urlOf(frame.id);
  const title = `鏡 ${shot.no}${frame.label ? `（${frame.label}）` : ""}`;
  return (
    <article className="hq-video-clip" aria-label={title}>
      <header className="hq-row">
        <h3 className="hq-h3">{title}</h3>
        {shot.line !== "—" && <span className="hq-sub">{LINE_LABEL[shot.line]}</span>}
        <span className="hq-sub">{shot.time}</span>
      </header>
      <div className="hq-video-frame wide">
        {url ? <img src={url} alt={`${title}起始畫面`} loading="lazy" /> : <span className="hq-sub">分鏡圖還沒上傳</span>}
      </div>
      <div className="hq-row hq-row-tight">
        <code className="hq-video-file">{startFrameFileName(frame.id)}</code>
        <DownloadRef id={frame.id} url={url} fileName={startFrameFileName(frame.id)} />
      </div>
      <dl className="hq-video-shotinfo">
        <div><dt>成片用</dt><dd>{cut} 秒</dd></div>
        <div><dt>建議生成</dt><dd>{generate} 秒</dd></div>
        <div><dt>畫面</dt><dd>{shot.picture}</dd></div>
      </dl>
      <RefChips refs={frame.refs} urlOf={urlOf} />
      <Prompt text={motionPrompt(frame)} copy={copy} title="圖生影片 prompt（動作與運鏡）" open />
    </article>
  );
}
