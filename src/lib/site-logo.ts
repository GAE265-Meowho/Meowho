// 網站 Logo 設定值解析（Issue #23）：meow_site_settings.logo 可為內建代號或上傳檔案的 https 公開網址
import { LOGOS } from "./mock-data";

export interface SiteLogo { id: string; name: string; src: string; kind: "builtin" | "upload" }

export function resolveSiteLogo(value: unknown): SiteLogo {
  if (typeof value === "string") {
    const builtin = LOGOS.find(l => l.id === value);
    if (builtin) return { ...builtin, kind: "builtin" };
    if (/^https:\/\/[^\s"'<>]+$/i.test(value)) return { id: "upload", name: "上傳的 Logo", src: value, kind: "upload" };
  }
  return { ...LOGOS[0], kind: "builtin" };
}
