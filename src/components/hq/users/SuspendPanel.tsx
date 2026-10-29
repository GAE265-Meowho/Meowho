"use client";
// 停權／解除停權（規格書 §4.6、R7、R8、R10、R11）：「停權中」checkbox，勾選或取消時展開原因（必填）與期限，按「儲存」才生效。
import { useState } from "react";
import { composeReason, getImpactMessage, getQuickReasons, UNSUSPEND_NOTICE, type SuspendDuration } from "@/lib/hq/actions";
import { canSuspend, type HqActor, type HqTarget } from "@/lib/hq/permissions";
import { HqSaveButton } from "../HqStates";
import { ReasonField } from "./ReasonField";

export type SuspendSubmit = { suspend: true; reason: string; duration: SuspendDuration } | { suspend: false; reason: string };

const DURATIONS: { value: SuspendDuration; label: string }[] = [
  { value: "7d", label: "7 天" }, { value: "30d", label: "30 天" }, { value: "manual", label: "直到手動解除" },
];

export function SuspendPanel({ actor, target, suspended, untilText, pendingApplications = 0, onSubmit }: {
  actor: HqActor | null; target: HqTarget; suspended: boolean; untilText?: string | null; pendingApplications?: number;
  onSubmit: (v: SuspendSubmit) => Promise<void> | void;
}) {
  const rule = canSuspend(actor, target);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState({ quick: "", extra: "" });
  const [duration, setDuration] = useState<SuspendDuration>("manual");
  const wantSuspend = editing ? !suspended : suspended;
  const text = composeReason(reason.quick, reason.extra);
  const impact = getImpactMessage(pendingApplications);

  function toggle() {
    setEditing(e => !e);
    setReason({ quick: "", extra: "" });
    setDuration("manual");
  }
  async function save() {
    await onSubmit(wantSuspend ? { suspend: true, reason: text, duration } : { suspend: false, reason: text });
    setEditing(false);
    setReason({ quick: "", extra: "" });
  }

  return (
    <section className="hq-box" aria-label="停權">
      <h3>停權</h3>
      <label className="hq-check">
        <input type="checkbox" checked={wantSuspend} disabled={!rule.allowed} onChange={toggle} />
        停權中
      </label>
      {!rule.allowed && <p className="hq-hint" style={{ margin: 0 }}>{rule.message}</p>}
      {rule.allowed && rule.note && <p className="hq-hint" style={{ margin: 0 }}>{rule.note}</p>}
      {!editing && suspended && untilText && <p className="hq-hint" style={{ margin: 0 }}>{untilText}</p>}
      {editing && wantSuspend && impact && <p className="hq-note">{impact}</p>}
      {editing && (
        <>
          <ReasonField quick={getQuickReasons(wantSuspend ? "suspend" : "unsuspend")} value={reason} onChange={setReason} />
          {wantSuspend ? (
            <fieldset className="hq-fieldset">
              <legend className="hq-label">停權期限</legend>
              <div className="hq-row">
                {DURATIONS.map(d => (
                  <label key={d.value} className="hq-check">
                    <input type="radio" name="hq-suspend-duration" checked={duration === d.value} onChange={() => setDuration(d.value)} />{d.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="hq-note">解除停權後，{UNSUSPEND_NOTICE}，對方需要重新申請。</p>
          )}
          <div className="hq-row hq-actions">
            <HqSaveButton onSave={save} disabled={!text}>儲存</HqSaveButton>
            <button type="button" className="hq-btn ghost" onClick={toggle}>取消</button>
          </div>
        </>
      )}
    </section>
  );
}
