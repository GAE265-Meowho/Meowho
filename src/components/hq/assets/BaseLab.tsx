"use client";
// 骨架測試台：/MeowHQ/assets/bases?body=<large|adult|kitten> 每個分頁的工作區（#302 起嵌在體型預覽頁，頁首與分頁由頁面負責）。
// 用骨架自己的示範毛色測試動作與眼睛參數；沒有眼球的體型（大貓）不顯示眼睛參數、眨眼與看游標。
// 移植自 cat_studio 的 /eye?mode=clips（貓眼測試頁）：動作、播放速度、眨眼、瞳孔、亮度、虹膜／角膜、顏色、異色瞳、看游標。
// 這裡調的數值只在這頁預覽，不會存回骨架。
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { baseInfo, previewBaseUrl, previewDownloadUrl, previewFileName, previewFraming, type PreviewBody } from "@/lib/hq/cat-models/bases";
import { clipPupil, resolveClip } from "@/lib/hq/cat-models/clips";
import { HqSkeleton } from "../HqStates";
import { autoPupil, EYE_DEFAULTS, EYE_PRESETS, type EyeParams } from "./catEye";
import type { PreviewInfo } from "./CatPreview";
import { ClipList } from "./ClipList";
import { PanelGroup } from "./PanelGroup";
import { BaseInfoPanel } from "./BaseInfoPanel";

const CatPreview = dynamic(() => import("./CatPreview"), { ssr: false, loading: () => <HqSkeleton rows={4} /> });

type PresetKey = keyof typeof EYE_PRESETS;
const SLIDERS: { key: "irisSize" | "corneaBulge" | "ior"; label: string; min: number; max: number }[] = [
  { key: "irisSize", label: "虹膜大小", min: 0.3, max: 0.85 },
  { key: "corneaBulge", label: "角膜凸起", min: 0, max: 0.95 },
  { key: "ior", label: "角膜折射率", min: 1, max: 2 },
];
const COLORS: { key: "irisInner" | "irisOuter" | "scleraColor"; label: string }[] = [
  { key: "irisInner", label: "虹膜內圈" },
  { key: "irisOuter", label: "虹膜外圈" },
  { key: "scleraColor", label: "眼白" },
];

export function BaseLab({ body }: { body: PreviewBody }) {
  const [info, setInfo] = useState<PreviewInfo | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [blink, setBlink] = useState(0);
  const [light, setLight] = useState(1);
  const [lightPupil, setLightPupil] = useState(false);
  const [follow, setFollow] = useState(true);
  const [viewKey, setViewKey] = useState(0);
  const [eye, setEye] = useState<EyeParams>(EYE_DEFAULTS);
  const [preset, setPreset] = useState<PresetKey | null>(null);
  const [hetero, setHetero] = useState(false);

  const clips = info?.clips ?? [];
  const clip = info ? resolveClip(picked, clips) : null;
  const pupil = lightPupil ? autoPupil(light) : eye.pupil;
  const set = <K extends keyof EyeParams>(key: K, value: EyeParams[K]) => setEye(e => ({ ...e, [key]: value }));
  const framing = previewFraming(body);
  const label = `${baseInfo(body).label}骨架`;
  // 載入前先當作有眼球（避免面板跳動）；載入後依 glb 實際內容決定
  const hasEyes = !info || info.eyes > 0;
  const hasBlink = !info || info.morphs.some(m => m.startsWith("blink"));

  useEffect(() => {
    if (lightPupil) return;
    set("pupil", clipPupil(clip, framing));
  }, [clip, framing, lightPupil]);

  return (
      <div className="hq-catpage hq-lab">
        <section className="hq-catstage" aria-label="3D 預覽">
          {failed ? (
            <div className="hq-state" role="alert">
              <p>3D 預覽載入失敗</p>
              <p className="hq-hint">{failed}。請確認{label} glb 已上傳（{previewFileName(body)}）。</p>
            </div>
          ) : (
            <div className="hq-canvas" data-testid={`lab-canvas-${body}`}>
              <span className="hq-tag mute hq-canvas-badge">示範毛色</span>
              <CatPreview
                key={viewKey} baseUrl={previewBaseUrl(body)} body={framing} albedoUrl={null} clip={clip}
                speed={speed} paused={paused} blink={blink} pupil={pupil} light={light} follow={follow}
                eye={eye} eyeRight={hetero ? EYE_PRESETS.blue : undefined}
                onInfo={setInfo} onError={e => setFailed(e.message || "未知錯誤")}
              />
            </div>
          )}
          {info && (
            <p className="hq-hint" role="status">
              {info.eyes} 顆眼球、{info.bones} 根骨頭
              {info.morphs.length > 0 && `、形狀鍵 ${info.morphs.join(" / ")}`}
            </p>
          )}
        </section>

        <section className="hq-catside" aria-label="參數">
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
            {hasBlink && (
              <label className="hq-slider"><span>眨眼 {blink.toFixed(2)}</span>
                <input type="range" min={0} max={1} step={0.01} value={blink} onChange={e => setBlink(+e.target.value)} /></label>
            )}
            <label className="hq-slider"><span>環境亮度 {light.toFixed(2)}</span>
              <input type="range" min={0.2} max={2.5} step={0.01} value={light} onChange={e => setLight(+e.target.value)} /></label>
            {hasEyes ? (
              <label className="hq-check"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> 眼睛看游標</label>
            ) : <p className="hq-hint">這個體型還沒有眼球，眨眼與眼睛參數之後補上。</p>}
          </PanelGroup>
          <PanelGroup title="動作">
            <ClipList available={clips} current={clip} onPick={setPicked} />
            <a className="hq-btn small ghost" href={previewDownloadUrl(body)} download={previewFileName(body)}>下載 GLB</a>
            <p className="hq-hint">灰色的是規劃中的動作，骨架補入後會自動可點。</p>
          </PanelGroup>
          {hasEyes && <PanelGroup title="眼睛">
            <label className="hq-slider"><span>瞳孔寬窄（細縫 → 全圓） {pupil.toFixed(2)}</span>
              <input type="range" min={0} max={1} step={0.01} value={pupil} disabled={lightPupil} onChange={e => set("pupil", +e.target.value)} /></label>
            <label className="hq-check"><input type="checkbox" checked={lightPupil} onChange={e => setLightPupil(e.target.checked)} /> 瞳孔跟著亮度變化</label>
            {SLIDERS.map(s => (
              <label key={s.key} className="hq-slider"><span>{s.label} {eye[s.key].toFixed(2)}</span>
                <input type="range" min={s.min} max={s.max} step={0.01} value={eye[s.key]} onChange={e => set(s.key, +e.target.value)} /></label>
            ))}
            <div className="hq-chips" role="group" aria-label="虹膜顏色">
              {(Object.keys(EYE_PRESETS) as PresetKey[]).map(k => (
                <button key={k} type="button" className={preset === k ? "on" : ""} aria-pressed={preset === k}
                  onClick={() => { setPreset(k); setEye(e => ({ ...e, irisInner: EYE_PRESETS[k].irisInner, irisOuter: EYE_PRESETS[k].irisOuter })); }}>
                  {EYE_PRESETS[k].label}
                </button>
              ))}
            </div>
            <div className="hq-row">
              {COLORS.map(c => (
                <label key={c.key} className="hq-hint">
                  <input type="color" value={eye[c.key]} aria-label={c.label}
                    onChange={e => { setPreset(null); set(c.key, e.target.value); }} /> {c.label}
                </label>
              ))}
            </div>
            <label className="hq-check"><input type="checkbox" checked={hetero} onChange={e => setHetero(e.target.checked)} /> 異色瞳（右眼用藍色）</label>
            <button type="button" className="hq-btn ghost small" onClick={() => { setEye(EYE_DEFAULTS); setPreset(null); setHetero(false); setLightPupil(false); }}>眼睛參數還原</button>
            <p className="hq-hint">這裡調的數值只在這頁預覽，不會存回骨架。</p>
          </PanelGroup>}
          <PanelGroup title="貓咪資訊">
            <BaseInfoPanel body={body} />
          </PanelGroup>
        </section>
      </div>
  );
}
