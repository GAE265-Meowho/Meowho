"use client";
// 前導影片：配音（#504）。旁白另外用 TTS 做，兩個角色各固定一組聲音規格，補錄時照同一組設定做，聲音才會前後一致。
// 聲音規格：meow_trailer_voice_specs（0039，最新一筆＝目前規格，保留歷史）；26 句旁白音檔：Azure Blob（/api/hq/trailer-videos 的 n01–n26）。
import { useCallback, useEffect, useId, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { useHqToast } from "@/components/hq/HqToast";
import { hqErrorMessage } from "@/components/hq/errors";
import { formatLogTime } from "@/lib/hq/videos/gen-log";
import {
  EMPTY_VOICE_DRAFT, SPEAKERS, VOICE_LINES, VOICE_SPEC_LIMITS, VOICE_SPEC_TABLE, VOICE_TOOL_SUGGESTIONS, prepareVoiceSpec,
  type Speaker, type VoiceSpec, type VoiceSpecDraft,
} from "@/lib/hq/videos/voice";
import { videoSlotLabel } from "@/lib/hq/videos/trailer-video";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useCopy } from "./TrailerBoard";
import { TrailerVideosNotice, VideoSlot, useTrailerVideos } from "./TrailerVideos";

type Row = Omit<VoiceSpec, "author"> & { meow_profiles: { display_name: string | null; email: string | null } | null };

function useVoiceSpecs() {
  const { preview } = useHqActor();
  const [specs, setSpecs] = useState<VoiceSpec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (preview || !sb) return;
    const { data, error: e } = await sb.from(VOICE_SPEC_TABLE)
      .select("id, speaker, tool, voice, settings, note, created_at, meow_profiles(display_name, email)")
      .order("created_at", { ascending: false });
    if (e) { setError(hqErrorMessage(e)); return; }
    setError(null);
    setSpecs(((data ?? []) as unknown as Row[]).map(({ meow_profiles: p, ...r }) => ({
      ...r, settings: r.settings ?? "", note: r.note ?? "", author: p?.display_name || p?.email?.split("@")[0] || null,
    })));
  }, [preview]);
  useEffect(() => { void reload(); }, [reload]);
  return { specs, error, reload, available: !preview && Boolean(getBrowserSupabase()) };
}

type Filter = "all" | Speaker;

export function VoiceBoard() {
  const copy = useCopy();
  const media = useTrailerVideos();
  const voice = useVoiceSpecs();
  const [filter, setFilter] = useState<Filter>("all");
  const done = VOICE_LINES.filter(l => media.videos[l.id]?.length).length;
  const lines = VOICE_LINES.filter(l => filter === "all" || l.speaker === filter);

  return (
    <div className="hq-video">
      <section className="hq-video-sec" aria-labelledby="voice-why">
        <h2 id="voice-why">配音怎麼做</h2>
        <p>旁白不要用影片工具自動產生的聲音，每段都會換人。兩個角色各用一組固定的 TTS 聲音另外做，剪輯時再對齊畫面。</p>
        <ol className="hq-video-steps">
          <li>每個角色只用一個聲音（記下 Voice ID 或聲音名稱），整支片都不換。</li>
          <li>語速、穩定度、音調試好後記在下方「聲音規格」，之後每一句都用同一組。</li>
          <li>同一個角色的台詞同一天、用同一組設定一次做完；補錄某一句也照目前的規格。</li>
          <li>音檔照編號上傳到對應的那一句，下載時檔名會是「n03_小橘.mp3」這樣，剪輯時照順序排。</li>
        </ol>
        <p className="hq-sub">已上傳 {done}／{VOICE_LINES.length} 句。</p>
        <TrailerVideosNotice state={media} />
      </section>

      <section className="hq-video-sec" aria-labelledby="voice-spec">
        <h2 id="voice-spec">聲音規格</h2>
        {!voice.available && <p className="hq-note">示範模式不能讀寫聲音規格。</p>}
        {voice.error && <p className="hq-error" role="alert">{voice.error}</p>}
        <div className="hq-video-speakers">
          {SPEAKERS.map(s => <SpeakerCard key={s.id} speaker={s} specs={voice.specs.filter(x => x.speaker === s.id)} state={voice} />)}
        </div>
      </section>

      <section className="hq-video-sec" aria-labelledby="voice-lines">
        <h2 id="voice-lines">旁白音檔</h2>
        <div className="hq-chips" role="group" aria-label="篩選聲線">
          {([["all", "全部"], ["xiaoju", "小橘"], ["xiaojie", "小傑"]] as [Filter, string][]).map(([v, l]) => (
            <button key={v} className={filter === v ? "on" : ""} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <ol className="hq-video-lines">
          {lines.map(l => (
            <li key={l.id} className="hq-video-line-row">
              <div className="hq-row hq-row-tight">
                <b>{l.id}</b>
                <span className={`hq-video-line ${l.speaker === "xiaoju" ? "l-cat" : "l-human"}`}>{l.speaker === "xiaoju" ? "小橘" : "小傑"}</span>
                <span className="hq-sub">鏡 {l.shots}</span>
              </div>
              <p className="hq-video-line-text">{l.text}</p>
              <div className="hq-row hq-row-tight">
                <button type="button" className="hq-btn ghost small" onClick={() => copy(l.text)}>複製台詞</button>
              </div>
              <VideoSlot slot={l.id} label={videoSlotLabel(l.id)} state={media} media="audio" emptyText="還沒有音檔" />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function SpeakerCard({ speaker, specs, state }: { speaker: (typeof SPEAKERS)[number]; specs: VoiceSpec[]; state: ReturnType<typeof useVoiceSpecs> }) {
  const toast = useHqToast();
  const formId = useId();
  const [draft, setDraft] = useState<VoiceSpecDraft>(EMPTY_VOICE_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<keyof VoiceSpecDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const current = specs[0];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = prepareVoiceSpec(speaker.id, draft);
    if (!r.ok) { setErrors(r.errors); return; }
    const sb = getBrowserSupabase();
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.from(VOICE_SPEC_TABLE).insert(r.row);
    setBusy(false);
    if (error) { toast.show({ message: hqErrorMessage(error) }); return; }
    setDraft(EMPTY_VOICE_DRAFT); setErrors({});
    toast.show({ message: `已更新${speaker.name}的聲音規格` });
    await state.reload();
  }

  async function remove(s: VoiceSpec) {
    if (!window.confirm(`刪除 ${formatLogTime(s.created_at)} 的這筆規格？`)) return;
    const sb = getBrowserSupabase();
    if (!sb) return;
    const { error } = await sb.from(VOICE_SPEC_TABLE).delete().eq("id", s.id);
    if (error) { toast.show({ message: hqErrorMessage(error) }); return; }
    await state.reload();
  }

  const fields: { key: keyof VoiceSpecDraft; label: string; placeholder: string; multiline?: boolean }[] = [
    { key: "tool", label: "工具", placeholder: "例：Azure TTS" },
    { key: "voice", label: "聲音名稱／Voice ID", placeholder: "例：zh-TW-YunJheNeural" },
    { key: "settings", label: "參數", placeholder: "例：語速 0.9、音調 -2%、句間停頓 600ms", multiline: true },
    { key: "note", label: "備註", placeholder: "例：n05 句尾要再慢一點" },
  ];

  return (
    <article className="hq-video-speaker" aria-label={`${speaker.name}的聲音規格`}>
      <h3 className="hq-h3">{speaker.name}</h3>
      <p><span className="hq-sub">聲音方向　</span>{speaker.direction}</p>
      <p className="hq-sub">建議：{speaker.suggestion}</p>
      <div className="hq-video-current">
        <b>目前規格</b>
        {current ? (
          <>
            <p>{current.tool}・<code className="hq-video-file">{current.voice}</code></p>
            {current.settings && <p className="hq-video-logprompt">{current.settings}</p>}
            {current.note && <p className="hq-sub">{current.note}</p>}
            <p className="hq-sub">{formatLogTime(current.created_at)}{current.author ? `・${current.author}` : ""}</p>
          </>
        ) : <p className="hq-sub">還沒有規格，試好聲音後記在下面。</p>}
      </div>
      {specs.length > 1 && (
        <details>
          <summary className="hq-sub">過去的規格（{specs.length - 1} 筆）</summary>
          <ol className="hq-video-logs">
            {specs.slice(1).map(s => (
              <li key={s.id} className="hq-video-log">
                <p>{s.tool}・{s.voice}</p>
                {s.settings && <p className="hq-sub">{s.settings}</p>}
                <div className="hq-row hq-row-tight">
                  <span className="hq-sub">{formatLogTime(s.created_at)}{s.author ? `・${s.author}` : ""}</span>
                  <button type="button" className="hq-btn ghost small" onClick={() => void remove(s)}>刪除</button>
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
      {state.available && (
        <details>
          <summary className="hq-video-material-sum">{current ? "更新規格" : "記錄規格"}</summary>
          <form className="hq-video-logform" onSubmit={e => void save(e)} noValidate>
            <datalist id={`${formId}-tools`}>{VOICE_TOOL_SUGGESTIONS.map(t => <option key={t} value={t} />)}</datalist>
            {fields.map(f => {
              const id = `${formId}-${f.key}`;
              const common = {
                id, value: draft[f.key], placeholder: f.placeholder, maxLength: VOICE_SPEC_LIMITS[f.key],
                "aria-invalid": Boolean(errors[f.key]) || undefined, "aria-describedby": errors[f.key] ? `${id}-err` : undefined,
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(d => ({ ...d, [f.key]: e.target.value })),
              };
              return (
                <div key={f.key} className="hq-video-field">
                  <label htmlFor={id}>{f.label}{(f.key === "tool" || f.key === "voice") && <span aria-hidden="true">＊</span>}</label>
                  {f.multiline ? <textarea rows={3} {...common} /> : <input type="text" list={f.key === "tool" ? `${formId}-tools` : undefined} {...common} />}
                  {errors[f.key] && <p id={`${id}-err`} className="hq-error">{errors[f.key]}</p>}
                </div>
              );
            })}
            <div className="hq-row hq-row-tight">
              <button type="submit" className="hq-btn" disabled={busy}>{busy ? "儲存中…" : "儲存規格"}</button>
            </div>
          </form>
        </details>
      )}
    </article>
  );
}
