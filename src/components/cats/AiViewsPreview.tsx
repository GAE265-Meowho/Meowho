"use client";
// 中途在前台預覽 AI 三視角（#188）：建立貓咪時用側面、正面、背面照自動產生，約 1 分鐘。
// 產生中每 5 秒更新；完成後顯示三張，MeowHQ 製作頁也看得到同一份結果（之後由管理員做紋理貼圖與動作）。
import { useCallback, useEffect, useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import { aiViewsPhase, type AiViewsResponse } from "@/lib/cat-publish";
import s from "./catPage.module.css";

const VIEWS = [["left", "側面"], ["front", "正面"], ["back", "背面"]] as const;

export function AiViewsPreview({ catId, catName }: { catId: string; catName: string }) {
  const [data, setData] = useState<AiViewsResponse | null | undefined>(undefined);
  const load = useCallback(async () => {
    const res = await fetch(`/api/cats/${catId}/model/views`).catch(() => null);
    setData(res?.ok ? ((await res.json()) as AiViewsResponse) : null);
  }, [catId]);
  useEffect(() => { void load(); }, [load]);
  const phase = data === undefined ? "loading" : aiViewsPhase(data);
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [phase, load]);

  if (phase === "loading" || phase === "none") return null;
  return (
    <section className={f.card} aria-labelledby="sec-aiviews">
      <h2 id="sec-aiviews">AI 三視角</h2>
      {phase === "running" && <p className={f.lead} role="status">正在用你拍的照片畫{catName}的三個角度，大約 1 分鐘…</p>}
      {phase === "done" && <p className={f.lead}>這是 AI 依照片畫的{catName}，接下來會用它做 3D 模型。</p>}
      {phase === "failed" && <p className={f.lead} role="alert">有幾張沒畫成功，我們會請管理員重新產生。</p>}
      <ul className={s.aiViews}>
        {VIEWS.map(([v, label]) => (
          <li key={v}>
            <span className={s.aiViewBox}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {data?.views[v] ? <img src={data.views[v]!} alt={`${catName}的 AI ${label}`} /> : <span aria-hidden="true">{phase === "running" ? "…" : "—"}</span>}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
