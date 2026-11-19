"use client";
/* eslint-disable @next/next/no-img-element */
// 前導影片：影片（#493 產生影片 → #501 改以影片為主）。
// 最上方完整影片；每一段有段落影片與 (P) 生成紀錄；每格 AI 分鏡一張卡，主角是片段影片，
// 圖生影片要用的起始畫面、參考圖、prompt 收在「生成素材」摺疊區。系統錄影與剪輯字卡不用生成，不列。
import { NEGATIVE_PROMPT, clipSections, motionPrompt, startFrameFileName, type ClipItem } from "@/lib/hq/videos/clips";
import { frameCounts } from "@/lib/hq/videos/trailer";
import { videoSlotLabel } from "@/lib/hq/videos/trailer-video";
import { VIDEO_AUDIO_RULE } from "@/lib/hq/videos/voice";
import { GenLogButton, useGenLogs } from "./GenLog";
import { DownloadRef, Prompt, RefChips, useCopy, useTrailerUploads, type SlotProps } from "./TrailerBoard";
import { TrailerVideosNotice, VideoSlot, useTrailerVideos, type TrailerVideosState } from "./TrailerVideos";
import { useScriptEdits, type ScriptEditsState } from "./ScriptEdits";
import { shotValue } from "@/lib/hq/videos/script-edits";

const LINE_LABEL: Record<string, string> = { 貓: "貓線", 人: "人線", 匯: "匯聚", 產品: "產品" };

export function ClipsBoard() {
  const { urlOf } = useTrailerUploads();
  const copy = useCopy();
  const genLogs = useGenLogs();
  const videos = useTrailerVideos();
  const edits = useScriptEdits();
  const sections = clipSections();
  const items = sections.flatMap(s => s.items);
  const clipsDone = items.filter(i => videos.videos[i.frame.id]?.length).length;
  const sectionsDone = sections.filter(s => videos.videos[s.key]?.length).length;
  const counts = frameCounts();

  return (
    <div className="hq-video">
      <div className="hq-video-callout" role="note">
        <b>生成影片前先看：</b>{VIDEO_AUDIO_RULE}
        <span className="hq-sub">旁白在「前導影片：配音」用固定的兩個聲音另外做，才能確保前後一致。</span>
      </div>
      <section className="hq-video-sec" aria-labelledby="vid-full">
        <h2 id="vid-full">完整影片</h2>
        <TrailerVideosNotice state={videos} />
        <div className="hq-video-full">
          <VideoSlot slot="full" label={videoSlotLabel("full")} state={videos} emptyText="完整影片還沒上傳" />
        </div>
        <p className="hq-sub">
          段落影片 {sectionsDone}／{sections.length}、片段 {clipsDone}／{items.length}。系統錄影 {counts.record} 格、剪輯字卡 {counts.edit} 格在剪輯時加入，不用生成。
        </p>
        <details className="hq-video-prompt">
          <summary>怎麼產生片段</summary>
          <ol className="hq-video-steps">
            <li>到「前導影片：分鏡」上傳這一格的分鏡圖，以及要掛的定角、定景照。</li>
            <li>展開片段卡的「生成素材」，下載起始畫面和參考圖，檔名就是 prompt 裡寫的檔名。</li>
            <li>在圖生影片工具（例如 Kling）放上起始畫面，依序掛上參考圖，貼上 prompt 和負面 prompt，選建議的生成長度。{VIDEO_AUDIO_RULE}</li>
            <li>生成好的片段上傳回這張卡；剪好的段落和完整影片上傳到各段與最上方。</li>
          </ol>
        </details>
        <Prompt text={NEGATIVE_PROMPT} copy={copy} title="負面 prompt（每一格共用）" />
      </section>

      {sections.map(sec => (
        <section key={sec.key} className="hq-video-sec" aria-label={sec.title}>
          <div className="hq-video-sechead">
            <h2>{sec.title}<span className="hq-sub">（{sec.range}）</span></h2>
            <GenLogButton section={sec} state={genLogs} copy={copy} />
          </div>
          <div className="hq-video-section">
            <h3 className="hq-h3">段落影片</h3>
            <VideoSlot slot={sec.key} label={videoSlotLabel(sec.key)} state={videos} emptyText="這一段剪好後上傳" />
          </div>
          <h3 className="hq-h3">片段</h3>
          <div className="hq-video-clips">
            {sec.items.map(item => <ClipCard key={item.frame.id} item={item} urlOf={urlOf} copy={copy} videos={videos} edits={edits} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function ClipCard({ item, urlOf, copy, videos, edits }: { item: ClipItem; urlOf: SlotProps["urlOf"]; copy: (t: string) => void; videos: TrailerVideosState; edits: ScriptEditsState }) {
  const { shot, frame, cut, generate } = item;
  const url = urlOf(frame.id);
  const title = videoSlotLabel(frame.id);
  return (
    <article className="hq-video-clip" aria-label={title}>
      <header className="hq-row">
        <h4 className="hq-h3">{title}</h4>
        {shot.line !== "—" && <span className="hq-sub">{LINE_LABEL[shot.line]}</span>}
        <span className="hq-sub">{shot.time}・成片用 {cut} 秒</span>
      </header>
      <VideoSlot slot={frame.id} label={title} state={videos} emptyText="片段還沒上傳" />
      <details className="hq-video-material">
        <summary>生成素材（起始畫面、參考圖、prompt）</summary>
        <div className="hq-video-material-in">
          <div className="hq-video-frame wide">
            {url ? <img src={url} alt={`${title}起始畫面`} loading="lazy" /> : <span className="hq-sub">分鏡圖還沒上傳</span>}
          </div>
          <div className="hq-row hq-row-tight">
            <code className="hq-video-file">{startFrameFileName(frame.id)}</code>
            <DownloadRef id={frame.id} url={url} fileName={startFrameFileName(frame.id)} />
          </div>
          <dl className="hq-video-shotinfo">
            <div><dt>建議生成</dt><dd>{generate} 秒</dd></div>
            <div><dt>畫面</dt><dd>{shotValue(shot, "picture", edits.eff)}</dd></div>
          </dl>
          <RefChips refs={frame.refs} urlOf={urlOf} />
          <Prompt text={motionPrompt(frame)} copy={copy} title="圖生影片 prompt（動作與運鏡）" />
        </div>
      </details>
    </article>
  );
}
