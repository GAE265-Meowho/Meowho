"use client";
// 製作GLB工作區（規格書 04 §2.3；#110 改名；#129 版面整理）
// 左：虛擬貓咪檔案（2 份寬，捲動時固定，可收合；貓咪資訊、上傳照片、AI 三視角各自可收合）；
// 右：製作 GLB 工作區（1 份寬）＝製作流程、任務進度（成貓／幼貓各自狀態）、紋理貼圖（膠囊切換體型、確認、產生）、第 4 步。
// 成貓、幼貓紋理貼圖產生完成即採用，不再等人工確認；不滿意可重新產生或改用上一版。
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { composeReason } from "@/lib/hq/actions";
import {
  adoptTexture, BODY_LABELS, BODY_ORDER, CAT_STATUS_LABELS, CAT_STATUS_TONE, CAT_STEPS, catStepStates, elapsedMinutes, isJobActive, JOB_STAGES, jobStage,
  queueStalled, textureOf, viewsReady,
  type BodyType, type CatModelView,
} from "@/lib/hq/cat-models/types";
import { HqLoadError, HqSaveButton, HqSkeleton } from "../HqStates";
import { HqNotFound } from "../HqLoginPage";
import { ReasonField } from "../ReasonField";
import { useHqToast } from "../HqToast";
import { AiViews } from "./AiViews";
import { BodySwitch } from "./BodySwitch";
import { FLOW_ICONS, FlowStepper, type StepIcon } from "./FlowStepper";
import { assetsHref, ASSETS_CATS_HREF } from "./hrefs";
import { CAT_API, catFileUrl, postJson, useCat } from "./useCatModels";

const PAINT_ERRORS: Record<string, string> = {
  busy: "這隻貓已經在排隊或生成中",
  views_required: "請先完成 AI 三視角，再產生紋理貼圖",
  invalid_option: "照片角度或補花紋方式不正確",
  not_found: "找不到這隻貓",
};
const RESTORE_ERRORS: Record<string, string> = {
  reason_required: "請填寫原因",
  busy: "生成中不能換版，請等任務結束",
  no_previous: "沒有上一版可以換",
  not_found: "找不到這隻貓",
};

const POLL_MS = 3000;

const STAGE_ICONS: StepIcon[] = ["queue", "cutout", "model", "paint", "pattern", "upload", "done"];

/** 製作流程（4 步）：同一套步驟圖，工作區用精簡直向 */
function Flow({ cat }: { cat: CatModelView }) {
  const states = catStepStates(cat);
  return (
    <section className="hq-box" aria-label="製作流程">
      <h3>製作流程</h3>
      <FlowStepper compact label="貓咪製作流程" steps={CAT_STEPS.map((s, i) => ({
        title: s.title, icon: FLOW_ICONS[i], state: states[i],
      }))} />
    </section>
  );
}

/** 成貓、幼貓各自的紋理貼圖狀態：任務只算在它畫的體型上；另一個體型沒貼圖時，做完這筆會接著做 */
function bodyStatus(cat: CatModelView, body: BodyType): { text: string; tone: "" | "mute" | "warn" | "danger" } {
  const jobBody = cat.jobBody ?? cat.body;
  if (jobBody === body && cat.status === "queued") return { text: "排隊中", tone: "warn" };
  if (jobBody === body && cat.status === "running") return { text: "產生中", tone: "warn" };
  if (jobBody === body && cat.status === "failed") return { text: "失敗", tone: "danger" };
  const t = cat.bodyVariants?.[body]?.texture;
  if (t?.state === "confirmed" || t?.state === "pending") return { text: "完成", tone: "" };
  return isJobActive(cat.status) ? { text: "接著產生", tone: "mute" } : { text: "尚未產生", tone: "mute" };
}

function PairStatus({ cat }: { cat: CatModelView }) {
  return (
    <ul className="hq-pairstatus" aria-label="成貓、幼貓紋理貼圖狀態">
      {BODY_ORDER.map(body => {
        const s = bodyStatus(cat, body);
        return <li key={body}><span>{BODY_LABELS[body]}</span><span className={`hq-tag${s.tone ? ` ${s.tone}` : ""}`}>{s.text}</span></li>;
      })}
    </ul>
  );
}

/** 任務進度：成貓、幼貓各自的狀態＋目前這筆任務的步驟（依 worker 回報，不顯示虛構百分比） */
function Progress({ cat, now }: { cat: CatModelView; now: number }) {
  const stalled = queueStalled(cat.status, cat.jobQueuedAt, now);
  const stage = jobStage(cat, stalled);
  if (!stage) return cat.variantStorage ? <section className="hq-box" aria-label="任務進度"><h3>任務進度</h3><PairStatus cat={cat} /></section> : null;
  const jobBody = cat.variantStorage ? cat.jobBody ?? cat.body : null;
  const mins = elapsedMinutes(cat.jobStartedAt ?? cat.jobQueuedAt, now);
  const steps = JOB_STAGES.map((title, i) => ({
    title, icon: STAGE_ICONS[i],
    state: (i < stage.index || stage.index === 6 ? "done" : i > stage.index ? "todo" : stage.failed || stage.stalled ? "failed" : "active") as "done" | "todo" | "failed" | "active",
    note: i === stage.index && stage.stalled ? "排隊逾時" : undefined,
  }));
  return (
    <section className="hq-box" aria-label="任務進度">
      <h3>任務進度</h3>
      {cat.variantStorage && <PairStatus cat={cat} />}
      {/* 完成後只留摘要，步驟圖只在排隊、生成中、失敗時顯示 */}
      {stage.index < 6 && (
        <>
          <p>
            {jobBody && <strong>{BODY_LABELS[jobBody]}紋理貼圖：</strong>}
            <span className={`hq-tag${CAT_STATUS_TONE[cat.status] ? ` ${CAT_STATUS_TONE[cat.status]}` : ""}`}>{CAT_STATUS_LABELS[cat.status]}</span>
            {cat.jobStep && <> {cat.jobStep}</>}
          </p>
          <FlowStepper compact label="紋理貼圖任務進度" steps={steps} />
        </>
      )}
      {isJobActive(cat.status) && (
        <p className="hq-hint" role="status">
          {mins !== null && <>已經過 {mins} 分鐘。</>}AI 上色約需 3~6 分鐘；離開頁面任務照跑，回來可看到最新進度。
        </p>
      )}
      {stalled && <div className="hq-note" role="alert">排隊超過 2 分鐘還沒開始，paint_worker 可能沒有開啟，請確認 paint_worker.py 有在執行。</div>}
      {cat.jobStatus === "done" && cat.jobSeconds !== null && (
        <p className="hq-hint">上次生成耗時 {Math.floor(cat.jobSeconds / 60)} 分 {cat.jobSeconds % 60} 秒。</p>
      )}
      {cat.status === "failed" && <p className="hq-error" role="alert">生成失敗{cat.jobError ? `：${cat.jobError}` : ""}。可以改選項再試，已確認的紋理貼圖沒有被動到。</p>}
    </section>
  );
}

/** 產生／重新產生這個體型的紋理貼圖：用 AI 左側面照上色、看不到的花紋不補（Tina 2026-11-06 拿掉產生選項） */
function PaintButton({ cat, onDone }: { cat: CatModelView; onDone: () => void }) {
  const busy = isJobActive(cat.status) || cat.aiRunning.length > 0;
  const ready = viewsReady(cat);  // #135：三視角都成功才能產生
  const failedHere = cat.status === "failed" && (cat.jobBody ?? cat.body) === cat.body;
  const name = cat.variantStorage ? BODY_LABELS[cat.body] : "";
  const label = failedHere ? "重試" : cat.hasAlbedo ? `重新產生${name}紋理貼圖` : `產生${name}紋理貼圖`;

  async function save() {
    await postJson(`${CAT_API}/${cat.id}/paint`, { view: "left", fill: "none", ...(cat.variantStorage ? { body: cat.body } : {}) }, PAINT_ERRORS);
    onDone();
  }

  return (
    <>
      <div className="hq-row">
        <HqSaveButton onSave={save} disabled={busy || !ready}>{label}</HqSaveButton>
        {busy ? <span className="hq-hint">{cat.aiRunning.length ? "AI 三視角產生中，完成後才能產生紋理貼圖。" : "已有排隊中或生成中的任務。"}</span>
          : !ready && <span className="hq-hint" role="status">請先完成第 2 步「AI 三視角」（左側、正面、背部都成功），才能產生紋理貼圖。</span>}
      </div>
    </>
  );
}

/** 第 3 步：成貓／幼貓切換＋目前紋理貼圖預覽＋改用上一版＋產生。產生完成即採用。 */
function Texture({ cat, onDone, onPainted, onSelectBody }: {
  cat: CatModelView; onDone: (message: string) => void; onPainted: () => void; onSelectBody: (body: BodyType) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState({ quick: "", extra: "" });
  const text = composeReason(reason.quick, reason.extra);
  const busy = isJobActive(cat.status);
  const t = textureOf(cat);
  const variant = cat.bodyVariants?.[cat.body];
  const albedoUrl = variant?.albedoUrl ?? catFileUrl(cat.id, "albedo", cat.albedoVersion ?? undefined);
  const bodyName = cat.variantStorage ? BODY_LABELS[cat.body] : "";

  function close() { setOpen(false); setReason({ quick: "", extra: "" }); }
  async function restore() {
    await postJson(`${CAT_API}/${cat.id}/restore`, { reason: text, ...(cat.variantStorage ? { body: cat.body } : {}) }, RESTORE_ERRORS);
    close();
    onDone("已改用上一版紋理貼圖");
  }

  return (
    <section className="hq-box" aria-label="紋理貼圖">
      <h3>紋理貼圖</h3>
      {cat.variantStorage && <BodySwitch label="紋理貼圖體型" value={cat.body} onChange={onSelectBody} />}
      {busy && <p role="status"><span className="hq-tag warn">生成中</span> {cat.jobBody && cat.jobBody !== cat.body ? `${BODY_LABELS[cat.jobBody]}：` : ""}{cat.jobStep ?? "排隊中"}</p>}
      {cat.hasAlbedo ? (
        <figure className="hq-texture-preview" style={{ margin: 0 }}>
          <a href={albedoUrl} target="_blank" rel="noreferrer" aria-label="放大看目前紋理貼圖">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={albedoUrl} alt={`目前的${bodyName}紋理貼圖`} />
          </a>
          <figcaption>目前使用・點圖放大</figcaption>
        </figure>
      ) : (
        <div className="hq-texture-empty" role="status">
          <strong>{busy && (cat.jobBody ?? cat.body) === cat.body ? `${bodyName}紋理貼圖生成中` : `還沒有${bodyName}紋理貼圖`}</strong>
          {!busy && <span>{viewsReady(cat) ? "按下方「產生紋理貼圖」開始。" : "先完成 AI 三視角，再產生紋理貼圖。"}</span>}
        </div>
      )}
      {t.preview === "albedo_prev" && <p className="hq-hint">貓咪頁目前使用上一版。</p>}
      {t.state === "confirmed" && !open && (
        <div className="hq-row">
          <button type="button" className="hq-btn ghost small" disabled={!cat.hasPrevAlbedo || busy} onClick={() => setOpen(true)}>改用上一版</button>
          {cat.hasPrevAlbedo && busy && <span className="hq-hint">生成中不能換版</span>}
        </div>
      )}
      {open && (
        <>
          <ReasonField quick={[]} value={reason} onChange={setReason} />
          <div className="hq-row hq-actions">
            <HqSaveButton onSave={restore} disabled={!text}>確認改用上一版</HqSaveButton>
            <button type="button" className="hq-btn ghost" onClick={close}>取消</button>
          </div>
        </>
      )}
      {!open && <PaintButton cat={cat} onDone={onPainted} />}
    </section>
  );
}

/** 第 4 步：有紋理貼圖就能看動作。目前動作 glb＝共用母體＋目前紋理貼圖，在瀏覽器即時組合 */
function MakeGlb({ cat }: { cat: CatModelView }) {
  const t = textureOf(cat);
  const locked = t.state !== "confirmed";
  return (
    <section className={`hq-box${locked ? " locked" : ""}`} aria-label="製作動作 glb">
      <h3>製作動作 glb</h3>
      {locked ? (
        <p className="hq-hint" role="status">紋理貼圖完成後會自動套用。</p>
      ) : (
        <>
          <p>已套用紋理貼圖，可以到貓咪頁看動作。</p>
          <div className="hq-row"><Link href={assetsHref(cat.id)} className="hq-btn">前往貓咪頁看動作</Link></div>
        </>
      )}
    </section>
  );
}

function CatProfile({ cat }: { cat: CatModelView }) {
  const gender = cat.gender === "male" ? "公" : cat.gender === "female" ? "母" : "未設定";
  return (
    <details className="hq-ai-fold" open aria-label="貓咪資訊">
      <summary>貓咪資訊</summary>
      <dl className="hq-dl hq-ai-fold-body hq-studio-dl">
        <dt>名稱</dt><dd>{cat.name}</dd>
        <dt>喵戶</dt><dd>{cat.household?.name ?? "—"}</dd>
        <dt>性別</dt><dd>{gender}</dd>
        <dt>年齡</dt><dd>{cat.ageMonths === null ? "未填寫" : `${cat.ageMonths} 個月`}</dd>
        <dt>體重</dt><dd>{cat.weightKg === null ? "未填寫" : `${cat.weightKg} 公斤`}</dd>
        {cat.notes && <><dt>備註</dt><dd>{cat.notes}</dd></>}
      </dl>
    </details>
  );
}

/** 左欄：虛擬貓咪檔案（捲動時固定；▾ 展開／▸ 收合；手機預設收合） */
function CatFile({ cat, onStarted }: { cat: CatModelView; onStarted: () => void }) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mobile = window.matchMedia("(max-width: 767px)");
    if (mobile.matches) setExpanded(false);
    const onBreakpointChange = (event: MediaQueryListEvent) => setExpanded(!event.matches);
    mobile.addEventListener?.("change", onBreakpointChange);
    return () => mobile.removeEventListener?.("change", onBreakpointChange);
  }, []);

  return (
    <section className="hq-box hq-studio-file" aria-label="虛擬貓咪檔案">
      <div className="hq-studio-file-head">
        <h2>虛擬貓咪檔案</h2>
        <button type="button" className="hq-btn ghost hq-studio-file-toggle" aria-controls="studio-cat-file-content" aria-expanded={expanded}
          aria-label={expanded ? "收合虛擬貓咪檔案" : "展開虛擬貓咪檔案"} onClick={() => setExpanded(value => !value)}>
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>{expanded ? "收合" : "展開"}
        </button>
      </div>
      <div id="studio-cat-file-content" className="hq-studio-file-content" hidden={!expanded}>
        <CatProfile cat={cat} />
        {/* #110：原始照片＋AI 三視角 */}
        <AiViews cat={cat} onStarted={onStarted} uploadedTitle="上傳照片" foldable />
      </div>
    </section>
  );
}

function Studio({ cat, reload }: { cat: CatModelView; reload: () => void }) {
  const toast = useHqToast();
  const params = useSearchParams();
  const [now, setNow] = useState(() => Date.now());
  const [selectedBody, setSelectedBody] = useState<"adult" | "kitten">(
    params.get("body") === "adult" || params.get("body") === "kitten" ? params.get("body") as "adult" | "kitten" : cat.body);
  const variant = cat.bodyVariants?.[selectedBody];
  const displayCat: CatModelView = cat.variantStorage ? {
    ...cat, body: selectedBody, hasAlbedo: Boolean(variant?.albedoUrl), hasPrevAlbedo: Boolean(variant?.prevUrl),
    texture: adoptTexture(variant?.texture, selectedBody),
  } : cat;
  const active = isJobActive(cat.status) || cat.aiRunning.length > 0;

  // 排隊中、生成中、AI 照片產生中每 3 秒更新一次；結束就停
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { setNow(Date.now()); reload(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, reload]);

  const submitted = useCallback(() => { setNow(Date.now()); reload(); }, [reload]);
  const done = (message: string) => { toast.show({ message }); reload(); };

  return (
    <>
      <div className="hq-pagehead">
        {/* #118：還沒有 3D 時貓咪頁會轉回這裡，所以返回列表 */}
        {textureOf(displayCat).preview
          ? <Link href={assetsHref(cat.id)} className="hq-back">← 貓咪頁</Link>
          : <Link href={ASSETS_CATS_HREF} className="hq-back">← 虛擬體驗元件管理</Link>}
        <h1 className="hq-h1">{cat.name}</h1>
        <span className={`hq-tag${CAT_STATUS_TONE[cat.status] ? ` ${CAT_STATUS_TONE[cat.status]}` : ""}`}>{CAT_STATUS_LABELS[cat.status]}</span>
      </div>
      <div className="hq-studio-grid">
        <CatFile cat={cat} onStarted={submitted} />
        <section className="hq-studio-workspace" aria-label="製作 GLB 工作區">
          <h2>製作 GLB 工作區</h2>
          <Flow cat={displayCat} />
          <Progress cat={cat} now={now} />
          <Texture cat={displayCat} onDone={done} onPainted={submitted} onSelectBody={setSelectedBody} />
          <MakeGlb cat={displayCat} />
        </section>
      </div>
    </>
  );
}

export function StudioPageBody({ id }: { id: string }) {
  const { value, reload } = useCat(id);
  if (value.state === "loading") return <HqSkeleton rows={4} />;
  if (value.state === "missing") return <HqNotFound />;
  if (value.state === "error") return <HqLoadError onRetry={reload} />;
  if (value.state === "disabled") {
    return <div className="hq-state"><p>貓咪模型的資料來源還沒有啟用。</p><Link href={ASSETS_CATS_HREF}>回到列表</Link></div>;
  }
  return <Studio cat={value.data} reload={reload} />;
}
