// 舊網址 /MeowHQ/assets/bases/<adult|kitten|large>（骨架測試台）→ #302 起改成體型預覽頁的分頁
import { redirect } from "next/navigation";
import { HqNotFound } from "@/components/hq/HqLoginPage";
import { baseTabHref, isPreviewBody } from "@/lib/hq/cat-models/bases";

export default async function Page({ params }: { params: Promise<{ body: string }> }) {
  const { body } = await params;
  if (!isPreviewBody(body)) return <HqNotFound />;
  redirect(baseTabHref(body));
}
