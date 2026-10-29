import { HqNotFound } from "@/components/hq/HqLoginPage";

// /MeowHQ 底下不存在或無權限的網址：與「非管理員」同一個畫面，不透露後台存在
export default function NotFound() {
  return <HqNotFound />;
}
