"use client";
// Admin 授權（Issue #23，規格書 §4.3）：僅系統管理員。分頁以 ?tab= 切換：管理員授權（預設）、稽核日誌、統計、網站設定。
import { Suspense } from "react";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqSkeleton } from "@/components/hq/HqStates";
import { HqTabs, useListQuery } from "@/components/hq/list/HqList";
import { AuditTab } from "./AuditTab";
import { AuthTab } from "./AuthTab";
import { SettingsTab } from "./SettingsTab";
import { StatsTab } from "./StatsTab";

const TABS = [
  { value: "auth", label: "管理員授權" },
  { value: "audit", label: "稽核日誌" },
  { value: "stats", label: "統計" },
  { value: "settings", label: "網站設定" },
];

function AdminPage() {
  const [query, update] = useListQuery();
  const tab = TABS.some(t => t.value === query.tab) ? query.tab! : "auth";
  return (
    <>
      <HqPageHeader title="Admin 授權" sub="只有系統管理員看得到。所有變更都要填原因，並寫入稽核日誌。" />
      <HqTabs tabs={TABS} value={tab} onChange={v => update({ tab: v === "auth" ? undefined : v, q: undefined, status: undefined })} />
      {tab === "auth" && <AuthTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "stats" && <StatsTab />}
      {tab === "settings" && <SettingsTab />}
    </>
  );
}

export default function Page() {
  return (
    <HqModuleGuard module="admin_authorization">
      <Suspense fallback={<HqSkeleton rows={3} />}>
        <AdminPage />
      </Suspense>
    </HqModuleGuard>
  );
}
