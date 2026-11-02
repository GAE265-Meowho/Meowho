"use client";
// AI 三視角照片（#110，依 Stitch「MeowHQ Cat Model Builder」設計）：新增貓咪頁步驟 02 與製作glb工作區「貼圖結果」共用。
// 內容：年齡判斷列 → 四張卡片（原始照片＋AI 左側面／正面／背部；每張有狀態、重新產生、送出的指示可切換中｜EN）
//      → 「進階生成參數與畫質設定」→「用量與費用清單」。產生在伺服器背景跑，畫面靠父層輪詢更新。
import { useState } from "react";
import { buildViewPrompt } from "@/lib/prompts/cat-views";
import {
  AI_QUALITIES, AI_SIZES, GEN_VIEWS, GEN_VIEW_LABELS, IMAGE_PRICE, imageCostUsd, QUALITY_OUTPUT_TOKENS,
  type AiQuality, type AiSize, type CatModelView, type GenView,
} from "@/lib/hq/cat-models/types";
import { CAT_API, catFileUrl, postJson } from "./useCatModels";

const ERRORS: Record<string, string> = {
  ai_disabled: "尚未設定 AI 影像模型（AZURE_OPENAI_IMAGE_DEPLOYMENT）",
  busy: "正在產生中，請等這次完成",
  invalid_option: "照片角度不正確",
  not_found: "找不到這隻貓",
  permission_denied: "你沒有虛擬體驗元件管理的權限，或登入已過期",
  disabled: "資料來源還沒有啟用",
};

const KIND = { left: "gen_left", front: "gen_front", back: "gen_back" } as const;
/** 新增貓咪時選填的其他角度照片（存成 extra_photos 的 front／back） */
export const EXTRA_SLOTS = [
  { view: "front", kind: "photo_front", label: "其他角度照片 2" },
  { view: "back", kind: "photo_back", label: "其他角度照片 3" },
] as const;
const QUALITY_LABELS: Record<AiQuality, string> = { low: "低", medium: "中", high: "高" };
/** 估價用：每張參考照片＋指示約 1,300 輸入 token（2026-11-02 實測 1,225～1,288） */
const EST_INPUT_TOKENS = 1300;
export const estPerImageUsd = (q: AiQuality) => (EST_INPUT_TOKENS * IMAGE_PRICE.imageIn + QUALITY_OUTPUT_TOKENS[q] * IMAGE_PRICE.output) / 1_000_000;

export interface AiSettings { quality: AiQuality; size: AiSize }
export const DEFAULT_AI_SETTINGS: AiSettings = { quality: "low", size: "1024x1024" };

const fmtUsd = (n: number) => `US$${n.toFixed(4)}`;
const ageBandText = (m: number | null) => (m === null ? "看不出年齡" : m <= 6 ? "幼貓" : m >= 120 ? "老貓" : "成貓");

/** 年齡判斷列與「不是貓」警告 */
function Analysis({ cat }: { cat: CatModelView }) {
  const a = cat.aiAge;
  if (!a) return null;
  const months = a.months !== null ? `・約 ${Math.round(a.months)} 個月` : "";
  const source = a.source === "ai" ? "AI 依照片判斷" : a.source === "form" ? "依表單填的年齡" : "AI 判斷不出年齡，不加年齡指示";
  const facts = [a.coat && `毛色：${a.coat}`, a.breed && `品種：${a.breed}`, a.confidence !== null && `信心 ${Math.round(a.confidence * 100)}%`].filter(Boolean);
  return (
    <>
      <div className="hq-ai-analysis" role="status">
        <span className="hq-tag">{ageBandText(a.months)}{months}</span>
        <span>{source}{facts.length ? `｜${facts.join("｜")}` : ""}</span>
      </div>
      {a.isCat === false && (
        <div className="hq-ai-warn" role="alert">
          <strong>模型認為這不是貓</strong>
          <span>請確認原始照片是貓咪全身清楚的照片；AI 照片仍會產生，但可能不準。</span>
        </div>
      )}
    </>
  );
}

/** 一張卡片的指示：切換中｜EN、預設 3 行、可展開 */
function Prompt({ text }: { text: { en: string; zh: string } }) {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [open, setOpen] = useState(false);
  return (
    <div className="hq-ai-prompt">
      <div className="hq-ai-prompt-head">
        <span>提示詞（Prompt）</span>
        <span className="hq-seg" role="group" aria-label="指示語言">
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中</button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
        </span>
      </div>
      <p className={open ? "" : "hq-clamp3"} lang={lang === "zh" ? "zh-Hant" : "en"}>{text[lang]}</p>
      <button type="button" className="hq-link" onClick={() => setOpen(o => !o)}>{open ? "收合" : "展開全部"}</button>
    </div>
  );
}

function Card({ cat, view, busy, onRegenerate }: { cat: CatModelView; view: GenView; busy: boolean; onRegenerate: (v: GenView) => void }) {
  const label = GEN_VIEW_LABELS[view];
  const has = cat.aiViews.includes(view);
  const running = cat.aiRunning.includes(view);
  const err = cat.aiErrors[view];
  const src = catFileUrl(cat.id, KIND[view], cat.updatedAt);
  const status = running ? { text: "產生中", tone: "warn" } : err ? { text: "產生失敗", tone: "danger" } : has ? { text: "完成", tone: "" } : { text: "尚未產生", tone: "mute" };
  // 還沒產生過就顯示預設範本（含參考照片數；年齡要產生時才知道）
  const prompt = cat.aiPrompts[view] ?? buildViewPrompt(view, { refCount: 1 + cat.extraPhotos.length });
  return (
    <figure className="hq-ai-card" aria-busy={running} aria-label={`${label}照片`}>
      <div className="hq-ai-card-head">
        <span>{label}</span>
        <span className="hq-row-tight">
          {view === "left" && <span className="hq-tag">用來上色</span>}
          <span className={`hq-tag ${status.tone}`}>{status.text}</span>
        </span>
      </div>
      <div className="hq-ai-frame">
        {running ? (
          <div className="hq-ai-state" role="status"><span className="hq-spinner" aria-hidden="true" />產生中<small>約 20～60 秒</small></div>
        ) : has ? (
          <a href={src} target="_blank" rel="noreferrer" aria-label={`放大看${label}照片`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${label}照片`} />
          </a>
        ) : (
          <div className={`hq-ai-state${err ? " danger" : ""}`}>{err ?? "尚未產生"}</div>
        )}
        {!running && (has || err) && (
          <button type="button" className="hq-btn ghost small hq-ai-regen" disabled={busy} onClick={() => onRegenerate(view)}>重新產生</button>
        )}
      </div>
      <Prompt text={prompt} />
    </figure>
  );
}

/** 進階：畫質與尺寸，附每張估計費用 */
export function AiSettingsPanel({ value, onChange }: { value: AiSettings; onChange: (v: AiSettings) => void }) {
  return (
    <details className="hq-ai-fold">
      <summary>進階生成參數與畫質設定</summary>
      <div className="hq-ai-fold-body hq-row-2">
        <label className="hq-label">畫質
          <select className="hq-input" value={value.quality} onChange={e => onChange({ ...value, quality: e.target.value as AiQuality })}>
            {AI_QUALITIES.map(q => <option key={q} value={q}>{QUALITY_LABELS[q]}（每張約 {fmtUsd(estPerImageUsd(q))}）</option>)}
          </select>
        </label>
        <label className="hq-label">尺寸
          <select className="hq-input" value={value.size} onChange={e => onChange({ ...value, size: e.target.value as AiSize })}>
            {AI_SIZES.map(s => <option key={s} value={s}>{s.replace("x", "×")}</option>)}
          </select>
        </label>
      </div>
    </details>
  );
}

/** 用量與費用清單：每張的 token 與估計費用、合計 */
function UsagePanel({ cat }: { cat: CatModelView }) {
  const rows = GEN_VIEWS.filter(v => cat.aiUsage[v]).map(v => ({ v, u: cat.aiUsage[v]!, cost: imageCostUsd(cat.aiUsage[v]!) }));
  const total = rows.reduce((s, r) => s + r.cost, 0);
  return (
    <details className="hq-ai-fold">
      <summary>用量與費用清單</summary>
      <div className="hq-ai-fold-body">
        {rows.length ? (
          <table className="hq-table hq-ai-usage">
            <thead><tr><th>步驟</th><th>用量</th><th>估計費用</th></tr></thead>
            <tbody>
              {rows.map(({ v, u, cost }) => (
                <tr key={v}>
                  <td>{GEN_VIEW_LABELS[v]}</td>
                  <td>輸入 {u.input.toLocaleString()} token{u.imageIn !== null ? `（圖片 ${u.imageIn.toLocaleString()}、文字 ${(u.textIn ?? 0).toLocaleString()}）` : ""}、輸出 {u.output.toLocaleString()} token</td>
                  <td>{fmtUsd(cost)}</td>
                </tr>
              ))}
              <tr><td><strong>合計</strong></td><td>{cat.aiQuality ? `畫質：${QUALITY_LABELS[cat.aiQuality]}` : ""}</td><td><strong>{fmtUsd(total)}</strong>（約台幣 {(total * 32).toFixed(1)} 元）</td></tr>
            </tbody>
          </table>
        ) : <p className="hq-hint">產生完成後顯示每張照片的用量。</p>}
        {/* 價格出處：OpenAI gpt-image-2 公開價（2026-10），Azure 實際以帳單為準；年齡判斷的聊天模型用量很小（約 US$0.0001），不列 */}
        <p className="hq-hint">gpt-image-2 每百萬 token：文字輸入 US${IMAGE_PRICE.textIn}、圖片輸入 US${IMAGE_PRICE.imageIn}、圖片輸出 US${IMAGE_PRICE.output}。實際費用以 Azure 帳單為準。</p>
      </div>
    </details>
  );
}

export function AiViews({ cat, onStarted, settings, onSettings }: {
  cat: CatModelView; onStarted: () => void; settings?: AiSettings; onSettings?: (v: AiSettings) => void;
}) {
  const [own, setOwn] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const value = settings ?? own;
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const running = cat.aiRunning.length > 0;
  const nothingYet = !cat.aiViews.length && !running && !Object.keys(cat.aiErrors).length;

  async function start(views: GenView[]) {
    setError(null);
    setSending(true);
    try {
      await postJson(`${CAT_API}/${cat.id}/views`, { views, ...value }, ERRORS);
      onStarted();
    } catch (e) {
      setError((e as { hint?: string }).hint ?? "送出失敗，請稍後再試");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="hq-aiviews">
      <Analysis cat={cat} />
      {/* #118：上傳的照片（原始＋其他角度 2、3）與 AI 三視角分兩區 */}
      <h4 className="hq-ai-sub">上傳的照片</h4>
      <div className="hq-ai-grid" role="group" aria-label="上傳的照片">
        <figure className="hq-ai-card" aria-label="原始照片">
          <div className="hq-ai-card-head"><span>原始照片</span><span className="hq-tag mute">原始</span></div>
          <div className="hq-ai-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={catFileUrl(cat.id, "photo")} alt={`${cat.name} 的原始照片`} />
          </div>
          <p className="hq-hint">原樣保留，不送 AI 修改。</p>
        </figure>
        {EXTRA_SLOTS.filter(x => cat.extraPhotos.includes(x.view)).map(x => (
          <figure key={x.view} className="hq-ai-card" aria-label={x.label}>
            <div className="hq-ai-card-head"><span>{x.label}</span><span className="hq-tag mute">參考</span></div>
            <div className="hq-ai-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={catFileUrl(cat.id, x.kind)} alt={x.label} />
            </div>
            <p className="hq-hint">產生 AI 三視角時當參考圖。</p>
          </figure>
        ))}
      </div>
      {!cat.extraPhotos.length && <p className="hq-hint">沒有上傳其他角度照片。</p>}
      <h4 className="hq-ai-sub">AI 三視角</h4>
      <div className="hq-ai-grid" role="group" aria-label="AI 三視角">
        {GEN_VIEWS.map(v => <Card key={v} cat={cat} view={v} busy={running || sending} onRegenerate={view => start([view])} />)}
      </div>
      {nothingYet && (
        <div className="hq-row">
          <button type="button" className="hq-btn small" disabled={sending} onClick={() => start([...GEN_VIEWS])}>產生 AI 三視角</button>
        </div>
      )}
      {running && <p className="hq-hint" role="status">AI 照片產生中，約需 20～60 秒，離開頁面也會繼續。</p>}
      {error && <p className="hq-error" role="alert">{error}</p>}
      <AiSettingsPanel value={value} onChange={onSettings ?? setOwn} />
      <UsagePanel cat={cat} />
    </div>
  );
}
