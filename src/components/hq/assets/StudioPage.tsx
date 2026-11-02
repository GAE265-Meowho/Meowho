"use client";
// 製作glb工作區（規格書 04 §2.3 ②③④；#110 由「貼圖工作頁」改名）：產生選項、任務進度、貼圖結果與「改用上一版」。
// 3D 動作預覽在貓咪頁（§2.4），這裡完成後引導過去。
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { composeReason } from "@/lib/hq/actions";
import {
  CAT_STATUS_LABELS, CAT_STATUS_TONE, elapsedMinutes, FILL_LABELS, isJobActive, PHOTO_VIEW_LABELS, queueStalled,
  type CatModelView, type FillPattern, type PhotoView,
} from "@/lib/hq/cat-models/types";
import { HqLoadError, HqSaveButton, HqSkeleton } from "../HqStates";
import { HqNotFound } from "../HqLoginPage";
import { ReasonField } from "../ReasonField";
import { useHqToast } from "../HqToast";
import { AiViews } from "./AiViews";
import { assetsHref, ASSETS_CATS_HREF } from "./hrefs";
import { CAT_API, catFileUrl, postJson, useCat } from "./useCatModels";

const PAINT_ERRORS: Record<string, string> = {
  busy: "這隻貓已經在排隊或生成中",
  invalid_option: "照片角度或補花紋方式不正確",
  not_found: "找不到這隻貓",
};
const RESTORE_ERRORS: Record<string, string> = {
  reason_required: "請填寫原因",
  busy: "生成中不能換版，請等任務結束",
  no_previous: "沒有上一版可以換",
  not_found: "找不到這隻貓",
};

const VIEWS: PhotoView[] = ["front", "left", "right"];
const FILLS: FillPattern[] = ["none", "tabby"];
const POLL_MS = 3000;

function Options({ cat, onDone }: { cat: CatModelView; onDone: () => void }) {
  const [view, setView] = useState<PhotoView>(cat.photoView ?? "front");
  const [fill, setFill] = useState<FillPattern>(cat.fillPattern ?? "none");
  const busy = isJobActive(cat.status) || cat.aiRunning.length > 0;
  const aiLeft = cat.aiViews.includes("left");
  const label = cat.status === "failed" ? "重試" : cat.hasAlbedo ? "重新產生動作 glb" : "產生動作 glb";

  async function save() {
    await postJson(`${CAT_API}/${cat.id}/paint`, { view, fill }, PAINT_ERRORS);
    onDone();
  }

  return (
    <section className="hq-box" aria-label="產生選項">
      <h3>產生選項</h3>
      {aiLeft ? (
        // #110：有 AI 左側面照就用它上色，角度固定「左側」（頭朝左），不用再選
        <div className="hq-field">
          <span className="hq-label">上色照片</span>
          <p className="hq-hint">使用 AI 左側面照（頭朝左）上色；原始照片保留在貼圖結果。</p>
        </div>
      ) : (
        <div className="hq-field">
          <span className="hq-label" id="opt-view">照片角度</span>
          <div className="hq-chips" role="group" aria-labelledby="opt-view">
            {VIEWS.map(v => <button key={v} type="button" className={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => setView(v)}>{PHOTO_VIEW_LABELS[v]}</button>)}
          </div>
          <p className="hq-hint">側面照時，會把骨架轉到同方向再上色。</p>
        </div>
      )}
      <div className="hq-field">
        <span className="hq-label" id="opt-fill">補看不到的花紋</span>
        <div className="hq-chips" role="group" aria-labelledby="opt-fill">
          {FILLS.map(f => <button key={f} type="button" className={fill === f ? "on" : ""} aria-pressed={fill === f} onClick={() => setFill(f)}>{FILL_LABELS[f]}</button>)}
        </div>
        <p className="hq-hint">照片看不到的背部、側腹，用程序化花紋補上。</p>
      </div>
      <div className="hq-row">
        <HqSaveButton onSave={save} disabled={busy}>{label}</HqSaveButton>
        {busy && <span className="hq-hint">{cat.aiRunning.length ? "AI 照片產生中，完成後再送出。" : "已有排隊中或生成中的任務，完成後才能再送出。"}</span>}
      </div>
      {cat.hasAlbedo && !busy && <p className="hq-hint">重新產生成功後，現在的貼圖會變成「上一版」（只保留最近 1 版）；失敗時不會動到現在的貼圖。</p>}
    </section>
  );
}

function Progress({ cat, now }: { cat: CatModelView; now: number }) {
  if (!cat.jobStatus) return null;
  const mins = elapsedMinutes(cat.jobStartedAt ?? cat.jobQueuedAt, now);
  const stalled = queueStalled(cat.status, cat.jobQueuedAt, now);
  return (
    <section className="hq-box" aria-label="任務進度">
      <h3>任務進度</h3>
      <p>
        <span className={`hq-tag${CAT_STATUS_TONE[cat.status] ? ` ${CAT_STATUS_TONE[cat.status]}` : ""}`}>{CAT_STATUS_LABELS[cat.status]}</span>
        {cat.jobStep && <> {cat.jobStep}</>}
      </p>
      {isJobActive(cat.status) && (
        <p className="hq-hint" role="status">
          {mins !== null && <>已經過 {mins} 分鐘。</>}AI 上色約需 3~6 分鐘；離開頁面任務照跑，回來可看到最新進度。
        </p>
      )}
      {stalled && <div className="hq-note" role="alert">排隊超過 2 分鐘還沒開始，paint_worker 可能沒有開啟，請確認 paint_worker.py 有在執行。</div>}
      {cat.status !== "queued" && cat.status !== "running" && cat.jobStatus === "done" && cat.jobSeconds !== null && (
        <p className="hq-hint">上次生成耗時 {Math.floor(cat.jobSeconds / 60)} 分 {cat.jobSeconds % 60} 秒。</p>
      )}
      {cat.status === "failed" && <p className="hq-error" role="alert">生成失敗{cat.jobError ? `：${cat.jobError}` : ""}。可以改選項再試，現在的貼圖沒有被動到。</p>}
    </section>
  );
}

function Result({ cat, onDone, onStarted }: { cat: CatModelView; onDone: (message: string) => void; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState({ quick: "", extra: "" });
  const text = composeReason(reason.quick, reason.extra);
  const busy = isJobActive(cat.status);

  function close() { setOpen(false); setReason({ quick: "", extra: "" }); }
  async function restore() {
    await postJson(`${CAT_API}/${cat.id}/restore`, { reason: text }, RESTORE_ERRORS);
    close();
    onDone("已改用上一版貼圖");
  }

  return (
    <section className="hq-box" aria-label="貼圖結果">
      <h3>貼圖結果</h3>
      {/* #110：原始照片＋AI 三視角 */}
      <AiViews cat={cat} onStarted={onStarted} />
      <div className="hq-imgs" role="group" aria-label="貼圖">
        {cat.hasAlbedo ? (
          <figure>
            <a href={catFileUrl(cat.id, "albedo", cat.albedoVersion ?? undefined)} target="_blank" rel="noreferrer" aria-label="放大看目前貼圖">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={catFileUrl(cat.id, "albedo", cat.albedoVersion ?? undefined)} alt="目前使用的貼圖" />
            </a>
            <figcaption>目前使用（點圖放大）</figcaption>
          </figure>
        ) : (
          <p className="hq-hint">還沒有貼圖。按「產生動作 glb」開始。</p>
        )}
        {cat.hasPrevAlbedo && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={catFileUrl(cat.id, "albedo_prev", cat.albedoVersion ?? undefined)} alt="上一版貼圖" />
            <figcaption>上一版</figcaption>
          </figure>
        )}
      </div>

      {!open && (
        <div className="hq-row">
          <button type="button" className="hq-btn ghost small" disabled={!cat.hasPrevAlbedo || busy} onClick={() => setOpen(true)}>改用上一版</button>
          {!cat.hasPrevAlbedo && <span className="hq-hint">沒有上一版可以換</span>}
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

      {cat.hasAlbedo && (
        <div className="hq-row">
          <Link href={assetsHref(cat.id)} className="hq-btn">回到貓咪頁看動作</Link>
        </div>
      )}
    </section>
  );
}

function Studio({ cat, reload }: { cat: CatModelView; reload: () => void }) {
  const toast = useHqToast();
  const [now, setNow] = useState(() => Date.now());
  const active = isJobActive(cat.status) || cat.aiRunning.length > 0;

  // 排隊中、生成中、AI 照片產生中每 3 秒更新一次；結束就停
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { setNow(Date.now()); reload(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, reload]);

  const submitted = useCallback(() => { setNow(Date.now()); reload(); }, [reload]);

  return (
    <>
      <div className="hq-pagehead">
        {/* #118：還沒有 3D 時貓咪頁會轉回這裡，所以返回列表 */}
        {cat.hasAlbedo
          ? <Link href={assetsHref(cat.id)} className="hq-back">← {cat.name}</Link>
          : <Link href={ASSETS_CATS_HREF} className="hq-back">← 虛擬體驗元件管理</Link>}
        <h1 className="hq-h1">製作glb工作區</h1>
        <span className={`hq-tag${CAT_STATUS_TONE[cat.status] ? ` ${CAT_STATUS_TONE[cat.status]}` : ""}`}>{CAT_STATUS_LABELS[cat.status]}</span>
      </div>
      <div className="hq-form">
        <Options cat={cat} onDone={submitted} />
        <Progress cat={cat} now={now} />
        <Result cat={cat} onDone={message => { toast.show({ message }); reload(); }} onStarted={submitted} />
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
