"use client";
// 登入者在 MeowHQ 的身分（角色＋被授權模組），由 HqGate 提供給各頁面使用。
import { createContext, useContext } from "react";
import { hasModule, type HqActor } from "@/lib/hq/permissions";
import type { AdminModule } from "@/lib/hq/types";
import { HqNotFound } from "./HqLoginPage";
import { HqSkeleton } from "./HqStates";

export interface HqActorCtx {
  actor: HqActor | null;      // null＝授權讀取中
  userId: string | null;
  email: string | null;
  preview: boolean;           // 本機示範模式（未連資料庫）
  reload: () => void;         // 重新讀取角色與授權（例如操作途中權限被撤銷）
}

export const HqActorContext = createContext<HqActorCtx>({ actor: null, userId: null, email: null, preview: false, reload: () => {} });
export const useHqActor = () => useContext(HqActorContext);

/** 模組頁面的權限守門（UT-HQ-03）：沒有權限一律顯示「找不到頁面」，不透露後台存在 */
export function HqModuleGuard({ module, children }: { module: AdminModule; children: React.ReactNode }) {
  const { actor } = useHqActor();
  if (!actor) return <HqSkeleton rows={3} />;
  if (!hasModule(actor, module)) return <HqNotFound />;
  return <>{children}</>;
}
