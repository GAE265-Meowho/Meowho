"use client";
// 用戶權限管理（Issue #24，規格書 §4.3）：帳號（預設）／中途認證（?tab=shelters）
import { Suspense } from "react";
import { HqModuleGuard } from "@/components/hq/HqActor";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqTabs, useListQuery } from "@/components/hq/list/HqList";
import { AccountsTab } from "@/components/hq/users/AccountsTab";
import { SheltersTab } from "@/components/hq/users/SheltersTab";
import { USER_FILTERS, VERIFICATION_FILTERS } from "@/lib/hq/users";

const TABS = [{ value: "accounts", label: "帳號" }, { value: "shelters", label: "中途認證" }];

function UsersPage() {
  const [query, update] = useListQuery();
  const tab = query.tab === "shelters" ? "shelters" : "accounts";
  const filters: readonly { value: string; label: string }[] = tab === "shelters" ? VERIFICATION_FILTERS : USER_FILTERS;
  const statusLabel = filters.find(f => f.value === query.status)?.label;
  const filterLabel = [statusLabel, query.q && `「${query.q}」`].filter(Boolean).join("、") || null;
  return (
    <>
      <HqPageHeader title="用戶權限管理" sub="帳號停權、黑名單與中途之家認證" filterLabel={filterLabel}
        onClearFilter={() => update({ q: undefined, status: undefined })} />
      <HqTabs tabs={TABS} value={tab} onChange={v => update({ tab: v === "accounts" ? undefined : v, q: undefined, status: undefined })} />
      {tab === "shelters" ? <SheltersTab query={query} update={update} /> : <AccountsTab query={query} update={update} />}
    </>
  );
}

export default function Page() {
  return (
    <HqModuleGuard module="user_management">
      <Suspense><UsersPage /></Suspense>
    </HqModuleGuard>
  );
}
