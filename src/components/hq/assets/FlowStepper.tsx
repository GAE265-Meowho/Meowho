// 步驟流程圖（#129，參考 Tina 提供的 ESG 流程圖）：圓形線條圖示＋連接線＋STEP 編號＋標題＋說明。
// 目前步驟放大、實心、外圈呼吸光暈；完成的步驟打勾；失敗用危險色並一定搭配文字。
// 方向依容器寬度切換（container query）：寬時橫向，窄時直向。動畫有 prefers-reduced-motion 退路（hq.css）。
import type { ReactNode } from "react";
import type { StepState } from "@/lib/hq/cat-models/types";

export type StepIcon = "upload" | "views" | "paint" | "glb" | "queue" | "cutout" | "model" | "pattern" | "done" | "fail"
  // 系統操作流程圖（#468）
  | "login" | "home" | "cat" | "diary" | "tag" | "review" | "transfer" | "chat" | "search" | "check" | "send";

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
  login: <><path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" /><path d="M11 12h9" /><path d="m16 8 4 4-4 4" /></>,
  home: <><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></>,
  cat: <><path d="M5 10l1-5 4 3h4l4-3 1 5c.9 1.2 1.3 2.6 1.3 4 0 4-3.6 6-8.3 6s-8.3-2-8.3-6c0-1.4.4-2.8 1.3-4z" /><path d="M9.5 13.5h.01M14.5 13.5h.01" /></>,
  diary: <><path d="M6 4h11a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1z" /><path d="M5 18a2 2 0 0 1 2-2h11" /><path d="M9 8h5" /></>,
  tag: <><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  review: <><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 4V3h6v1" /><path d="m9 13 2 2 4-4" /></>,
  transfer: <><path d="M3 12l5-4.5L13 12v7H3z" /><path d="M14 9.5l3.5-3 3.5 3V19h-5" /><path d="M8 3.5c2-1.5 6-1.5 8 0" /><path d="m15 2 1 1.5-1.7.7" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  check: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  send: <><path d="M21 3 10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>,
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
