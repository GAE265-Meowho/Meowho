"use client";
// 上架／下架（規格書 04 §2.4、§5）：必填原因，寫入稽核；上架只限已完成或已下架，下架只限已上架
import { useState } from "react";
import { composeReason } from "@/lib/hq/actions";
import { canPublish, type CatModelStatus, type PublishAction } from "@/lib/hq/cat-models/types";
import { ReasonField } from "../ReasonField";
import { HqSaveButton } from "../HqStates";
import { CAT_API, postJson } from "./useCatModels";

const ERRORS: Record<string, string> = {
  reason_required: "請填寫原因",
  invalid_state: "目前的狀態不能做這個操作，請重新整理",
  not_found: "找不到這隻貓",
  permission_denied: "你沒有這個模組的權限，或尚未登入",
  disabled: "目前不能上架（資料來源尚未啟用）",
};

export async function postPublish(id: string, action: PublishAction, reason: string): Promise<void> {
  await postJson(`${CAT_API}/${id}/publish`, { action, reason }, ERRORS);
}

export function PublishPanel({ id, status, onDone }: { id: string; status: CatModelStatus; onDone: (message: string) => void }) {
  const action: PublishAction = status === "published" ? "unpublish" : "publish";
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState({ quick: "", extra: "" });
  const text = composeReason(reason.quick, reason.extra);
  const allowed = canPublish(status, action);
  const label = action === "publish" ? (status === "unpublished" ? "重新上架" : "上架") : "下架";

  function close() { setOpen(false); setReason({ quick: "", extra: "" }); }
  async function save() {
    await postPublish(id, action, text);
    close();
    onDone(`已${label}`);
  }

  return (
    <section className="hq-box" aria-label="上架管理">
      <h3>上架管理</h3>
      {!open && (
        <div className="hq-row">
          <button type="button" className={`hq-btn small${action === "unpublish" ? " ghost" : ""}`} disabled={!allowed} onClick={() => setOpen(true)}>{label}</button>
          {!allowed && <span className="hq-hint">{status === "draft" || status === "failed" ? "要先產生貼圖才能上架" : "目前的狀態不能上架"}</span>}
        </div>
      )}
      {open && (
        <>
          <ReasonField quick={[]} value={reason} onChange={setReason} />
          <div className="hq-row hq-actions">
            <HqSaveButton onSave={save} disabled={!text}>確認{label}</HqSaveButton>
            <button type="button" className="hq-btn ghost" onClick={close}>取消</button>
          </div>
        </>
      )}
    </section>
  );
}
