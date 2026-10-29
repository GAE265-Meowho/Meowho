"use client";
// 呼叫後台資料庫函式：成功顯示提示（含「查看紀錄」）；權限被撤銷時提示並回待辦總覽（規格書 §4.7）。
// 失敗一律丟出錯誤，由 HqSaveButton 在按鈕旁顯示白話說明並保留表單。
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useHqActor } from "../HqActor";
import { useHqToast } from "../HqToast";

export const AUDIT_LOG_HREF = "/MeowHQ/admin?tab=audit";

export function useHqRpc() {
  const router = useRouter();
  const { reload, preview } = useHqActor();
  const toast = useHqToast();
  return useCallback(async (fn: string, args: Record<string, unknown>, okMessage: string) => {
    const sb = getBrowserSupabase();
    if (!sb || preview) { toast.show({ message: `（示範模式，未寫入資料庫）${okMessage}` }); return; }
    const { error } = await sb.rpc(fn, args);
    if (error) {
      if (error.message === "permission_denied") {
        reload();
        toast.show({ message: "你的權限已變更" });
        router.push("/MeowHQ");
      }
      throw error;
    }
    toast.show({ message: okMessage, logHref: AUDIT_LOG_HREF });
  }, [router, reload, preview, toast]);
}
