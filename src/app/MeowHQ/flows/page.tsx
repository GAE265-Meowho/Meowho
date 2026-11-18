"use client";
// 系統操作流程圖（#468，Tina 2026-11-18）：前台角色的操作流程，樣式沿用貓咪製作流程（FlowStepper）。
// 分頁以 ?tab= 切換：貓戶（預設）、領養人。所有登入的管理員都看得到，不需授權模組。
import { Suspense } from "react";
import { FlowStepper } from "@/components/hq/assets/FlowStepper";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqSkeleton } from "@/components/hq/HqStates";
import { HqTabs, useListQuery } from "@/components/hq/list/HqList";
import { FLOW_ROLES, SYSTEM_FLOWS, flowRoleOf } from "@/lib/hq/system-flows";

function FlowsPage() {
  const [query, update] = useListQuery();
  const role = flowRoleOf(query.tab);
  const label = FLOW_ROLES.find(r => r.value === role)!.label;
  return (
    <>
      <HqPageHeader title="系統操作流程圖" sub="前台使用者從登入到完成領養的操作步驟。" />
      <HqTabs tabs={[...FLOW_ROLES]} value={role} onChange={v => update({ tab: v === "household" ? undefined : v })} />
      <section className="hq-flow hq-sysflow" aria-label={`${label}操作流程`}>
        {SYSTEM_FLOWS[role].map(phase => (
          <div key={phase.title} className="hq-sysflow-phase">
            <h3>{phase.title}<small>{phase.sub}</small></h3>
            <FlowStepper overview label={`${label}：${phase.title}`} start={phase.start}
              steps={phase.steps.map(s => ({ ...s, state: "todo" }))} />
          </div>
        ))}
      </section>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<HqSkeleton rows={3} />}>
      <FlowsPage />
    </Suspense>
  );
}
