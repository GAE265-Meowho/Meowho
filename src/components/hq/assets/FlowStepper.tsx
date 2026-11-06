// 步驟流程圖（#129，參考 Tina 提供的 ESG 流程圖）：圓形線條圖示＋連接線＋STEP 編號＋標題＋說明。
// 目前步驟放大、實心、外圈呼吸光暈；完成的步驟打勾；失敗用危險色並一定搭配文字。
// 方向依容器寬度切換（container query）：寬時橫向，窄時直向。動畫有 prefers-reduced-motion 退路（hq.css）。
import type { ReactNode } from "react";
import type { StepState } from "@/lib/hq/cat-models/types";

export type StepIcon = "upload" | "views" | "paint" | "glb" | "queue" | "cutout" | "model" | "pattern" | "done" | "fail";

const PATHS: Record<StepIcon, ReactNode> = {
  upload: <><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  views: <><rect x="3" y="6" width="6" height="12" rx="1.5" /><rect x="10" y="4" width="4" height="16" rx="1.5" /><rect x="15" y="6" width="6" height="12" rx="1.5" /></>,
  paint: <><path d="M4 20c2 0 3-1 3-3a2 2 0 1 1 4 0c0 2-2 3-4 3" /><path d="m10 14 9-9a1.5 1.5 0 0 1 2 2l-9 9" /></>,
  glb: <><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5" /><path d="M12 12v9" /></>,
  queue: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  cutout: <><path d="M5 5h3M16 5h3v3M19 16v3h-3M8 19H5v-3M5 8V5" /><path d="M10 15c0-2 1-3 2-3s2 1 2 3" /><circle cx="12" cy="9.5" r="1.5" /></>,
  model: <><path d="M5 16 12 4l7 12z" /><path d="M5 16l7 4 7-4" /></>,
  pattern: <><path d="M4 8c3-2 5 2 8 0s5 2 8 0" /><path d="M4 13c3-2 5 2 8 0s5 2 8 0" /><path d="M4 18c3-2 5 2 8 0s5 2 8 0" /></>,
  done: <path d="m5 12 4 4 10-10" />,
  fail: <><path d="M12 7v6" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></>,
};

function Icon({ name }: { name: StepIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** 貓咪製作 4 步的圖示（列表上方、製作GLB工作區共用） */
export const FLOW_ICONS: StepIcon[] = ["upload", "views", "paint", "glb"];

const STATE_TEXT: Record<StepState, string> = { done: "已完成", active: "進行中", todo: "尚未開始", failed: "失敗" };

export interface FlowStep { title: string; desc?: string; icon: StepIcon; state: StepState; note?: string }

/**
 * loop：在兩個步驟之間畫一條虛線回圈（例：第 4 步不滿意，回到第 3 步重新產生），只在橫向時顯示。
 * start：第一步的 STEP 編號（分流圖後半段從 3 開始）；short：步驟少，容器窄一點也橫向排。
 */
export function FlowStepper({ steps, label, compact = false, overview = false, loop, start = 1, short = false }: {
  steps: FlowStep[]; label: string; compact?: boolean; overview?: boolean; loop?: { from: number; to: number; text: string }; start?: number; short?: boolean;
}) {
  const n = steps.length;
  return (
    <div className={`hq-flowsteps${compact ? " compact" : ""}${overview ? " overview" : ""}${short ? " short" : ""}`}>
      {loop && (
        <div className="hq-flowloop" aria-hidden="true"
          style={{ left: `${(Math.min(loop.from, loop.to) + 0.5) * 100 / n}%`, right: `${(n - Math.max(loop.from, loop.to) - 0.5) * 100 / n}%` }}>
          <span>{loop.text}</span>
        </div>
      )}
      <ol aria-label={label}>
        {steps.map((s, i) => (
          <li key={s.title} className={`hq-flowstep-${s.state}`} aria-current={s.state === "active" ? "step" : undefined}>
            <span className="hq-flowdot">
              <Icon name={s.state === "done" ? "done" : s.state === "failed" ? "fail" : s.icon} />
            </span>
            <span className="hq-flowtext">
              <span className="hq-flowno">STEP {String(i + start).padStart(2, "0")}{!overview && <span className="hq-sr">・{STATE_TEXT[s.state]}</span>}</span>
              <strong>{s.title}</strong>
              {s.desc && <span className="hq-flowdesc">{s.desc}</span>}
              {s.note && <span className="hq-flownote">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
