"use client";
/* eslint-disable @next/next/no-img-element */
// 前導影片：影片（#493 產生影片 → #501 改以影片為主）。
// 最上方完整影片；每一段有段落影片與 (P) 生成紀錄；每格 AI 分鏡一張卡，主角是片段影片，
// 圖生影片要用的起始畫面、參考圖、prompt 收在「生成素材」摺疊區。剪輯字卡不用生成，不列。
// 第三段另有「系統錄影」（#529）：scripts/trailer-rec 在正式站照分鏡錄的真實產品畫面，剪輯與 AI 生圖時當參考。
import { CLIP_MOTION, NEGATIVE_PROMPT, clipSections, motionPrompt, startFrameFileName, type ClipItem } from "@/lib/hq/videos/clips";
import { frameCounts } from "@/lib/hq/videos/trailer";
import { compositeShots, videoSlotLabel } from "@/lib/hq/videos/trailer-video";
import { VIDEO_AUDIO_RULE } from "@/lib/hq/videos/voice";
import { REC_CLIPS } from "@/lib/hq/videos/rec-clips";
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
          {/* #565：完整影片拆成兩支 */}
          <div><h3 className="hq-h3">{videoSlotLabel("full")}<span className="hq-sub">（第一段＋第二段）</span></h3><VideoSlot slot="full" label={videoSlotLabel("full")} state={videos} emptyText="前導影片還沒上傳" /></div>
          <div><h3 className="hq-h3">{videoSlotLabel("demo")}<span className="hq-sub">（第三段＋第四段）</span></h3><VideoSlot slot="demo" label={videoSlotLabel("demo")} state={videos} emptyText="系統 Demo 影片還沒上傳" /></div>
        </div>
        <p className="hq-sub">
          段落影片 {sectionsDone}／{sections.length}、片段 {clipsDone}／{items.length}。剪輯字卡 {counts.edit} 格在剪輯時加入，不用生成。
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
            {sec.items.flatMap((item, i) => {
              const cards = [<ClipCard key={item.frame.id} item={item} urlOf={urlOf} copy={copy} videos={videos} edits={edits} />];
              // #548：多格（或拆成多支短片）的鏡頭，最後一張片段卡後面接「整鏡成品」
              const comp = COMPOSITES.get(item.shot.no);
              if (comp && sec.items[i + 1]?.shot.no !== item.shot.no) cards.push(<CompositeCard key={comp} slot={comp} item={item} videos={videos} edits={edits} />);
              return cards;
            })}
          </div>
          {sec.key === "product" && <RecClips videos={videos} />}
        </section>
      ))}
    </div>
  );
}

/** 第三段的系統錄影：每支一格，標出是哪一鏡、誰的畫面 */
function RecClips({ videos }: { videos: TrailerVideosState }) {
  const done = REC_CLIPS.filter(c => videos.videos[c.id]?.length).length;
  return (
    <>
      <h3 className="hq-h3">系統錄影<span className="hq-sub">（{done}／{REC_CLIPS.length}）</span></h3>
      <div className="hq-video-clips">
        {REC_CLIPS.map(c => (
          <article key={c.id} className="hq-video-clip" aria-label={videoSlotLabel(c.id)}>
            <header className="hq-row">
              <h4 className="hq-h3">鏡 {c.shot}・{c.title}</h4>
              <span className="hq-sub">{c.who}的畫面</span>
            </header>
            <VideoSlot slot={c.id} label={videoSlotLabel(c.id)} state={videos} emptyText="系統錄影還沒上傳" />
            <p className="hq-sub">{c.note}</p>
          </article>
        ))}
      </div>
    </>
  );
}

const COMPOSITES = new Map(compositeShots().map(c => [c.shot.no, c.id]));

/** 整鏡成品（#548）：把這一鏡的幾支片段剪好／合成（例如分割畫面）後上傳 */
function CompositeCard({ slot, item, videos, edits }: { slot: string; item: ClipItem; videos: TrailerVideosState; edits: ScriptEditsState }) {
  const { shot, cut } = item;
  const title = videoSlotLabel(slot);
  const parts = shot.frames.length >= 2 ? shot.frames.map(f => videoSlotLabel(f.id)).join("＋") : `鏡 ${shot.no} 的 ${CLIP_MOTION[shot.frames[0].id]?.cuts?.length ?? 0} 支短片`;
  return (
    <article className="hq-video-clip hq-video-composite" aria-label={title}>
      <header className="hq-row">
        <h4 className="hq-h3">{title}</h4>
        <span className="hq-sub">{shot.time}・成片 {cut} 秒</span>
      </header>
      <VideoSlot slot={slot} label={title} state={videos} emptyText="把這一鏡剪好或合成後上傳" />
      <p className="hq-sub">由 {parts} 剪接／合成：{shotValue(shot, "picture", edits.eff)}</p>
    </article>
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
            <div><dt>建議生成</dt><dd>{CLIP_MOTION[frame.id]?.cuts ? `5 秒 × ${CLIP_MOTION[frame.id]!.cuts!.length} 支，各剪約 ${(cut / CLIP_MOTION[frame.id]!.cuts!.length).toFixed(1)} 秒` : `${generate} 秒`}</dd></div>
            <div><dt>畫面</dt><dd>{shotValue(shot, "picture", edits.eff)}</dd></div>
          </dl>
          <RefChips refs={frame.refs} urlOf={urlOf} />
          {frame.make === "record"
            // #547：系統錄影格的分鏡是真人＋真實 UI，用 Kling 綠幕生成動作再合成真實錄影，prompt 依 SOP 每格自己寫
            ? <p className="hq-sub">這一格照「前導影片第三段片段製作 SOP」（docs/video）做：素材包的綠幕底圖當起始畫面，螢幕換成真實系統錄影。</p>
            : <Prompt text={motionPrompt(frame)} copy={copy} title="圖生影片 prompt（動作與運鏡）" />}
        </div>
      </details>
    </article>
  );
}
