// 首次登入條款同意：必須讀到條款最下方，才能勾選並同意（Issue #16、FR-01-02）

export type ScrollBox = { scrollTop: number; clientHeight: number; scrollHeight: number };

/** 容許誤差（px）：不同瀏覽器捲到底時常差幾個像素 */
const READ_TOLERANCE = 8;

/** 是否已讀到最下方；內容短到不需要捲動時直接視為已讀 */
export function hasReadToEnd({ scrollTop, clientHeight, scrollHeight }: ScrollBox): boolean {
  return scrollTop + clientHeight >= scrollHeight - READ_TOLERANCE;
}

/** 讀完且勾選才能按「同意並繼續」 */
export function canAgreeTerms({ read, checked }: { read: boolean; checked: boolean }): boolean {
  return read && checked;
}

/** 把條款 Markdown 整理成純文字：拿掉第一行標題、Markdown 符號，壓縮連續空行 */
export function cleanLegalText(markdown: string): string {
  return markdown.replace(/^#\s.*\n/, "").replace(/[#>*|`]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
