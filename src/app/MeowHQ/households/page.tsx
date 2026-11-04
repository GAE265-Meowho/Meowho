"use client";
// 貓戶管理（Issue #179）：依類別查看所有貓戶。不是授權模組，所有管理員都看得到（HqGate 已擋非管理員）。
import { Suspense } from "react";
import { HouseholdsList } from "@/components/hq/households/HouseholdsList";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { useListQuery } from "@/components/hq/list/HqList";

function HouseholdsPage() {
  const [query, update] = useListQuery();
  return (
    <>
      <HqPageHeader title="貓戶管理" sub="依類別查看所有貓戶" filterLabel={query.q ? `「${query.q}」` : null}
        onClearFilter={() => update({ q: undefined })} />
      <HouseholdsList query={query} update={update} />
    </>
  );
}

export default function Page() {
  return <Suspense><HouseholdsPage /></Suspense>;
}
