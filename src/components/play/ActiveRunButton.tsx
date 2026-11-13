"use client";
// 全站右下角「回任務」按鈕：有進行中的領養任務時才出現，顯示貓名與進度，按了回 /cats/[id]/play。
// 任務頁本身、後台（MeowHQ）不顯示。掛在 Providers 裡（src/components/Providers.tsx）。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { progressLabel } from "@/lib/play/save";
import s from "./active-run.module.css";
import { useActiveRun } from "./useActiveRun";

export function ActiveRunButton() {
  const run = useActiveRun();
  const path = usePathname() ?? "";
  if (!run || path.startsWith("/MeowHQ") || /^\/cats\/[^/]+\/play\/?$/.test(path)) return null;
  const label = progressLabel(run.catName, run.progress);
  return (
    <Link className={s.btn} href={`/cats/${encodeURIComponent(run.catId)}/play`} aria-label={`回到${label}`}>
      <span className={s.dot} aria-hidden="true" />
      <span className={s.text}><b>回任務</b><span>{label}</span></span>
    </Link>
  );
}
