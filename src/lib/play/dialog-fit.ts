// 虛擬飼養的劇情對話框（#354）：不捲動。內容放不下時分頁（用「繼續」翻），寬畫面排兩欄。純函式，畫面在 NodeStep。
// 高度、寬度都是估算（字級 × 字數），夠用來決定「這頁放幾項」；實際排版仍由 CSS 自動換行。

/** 依可用高度把項目分頁（貪婪）：每頁至少一項，項目之間算 gap。回傳每頁的項目索引 */
export function pageBreaks(heights: number[], avail: number, gap = 0): number[][] {
  const pages: number[][] = [[]];
  let used = 0;
  heights.forEach((h, i) => {
    const cur = pages[pages.length - 1];
    const need = cur.length ? used + gap + h : h;
    if (cur.length && need > avail) { pages.push([i]); used = h; }
    else { cur.push(i); used = need; }
  });
  return pages;
}

/** 晶片橫排、自動換行：依寬度分列，回傳每列的項目索引 */
export function packRows(widths: number[], maxWidth: number, gap = 0): number[][] {
  return pageBreaks(widths, maxWidth, gap);
}

/** 估算一段文字的寬度：中文（全形）約一個字級，英數與半形符號約 0.6 個字級 */
export function estimateTextWidth(t: string, fontPx: number): number {
  let w = 0;
  for (const ch of t) w += /[\u0000-ÿ]/.test(ch) ? 0.6 : 1;
  return w * fontPx;
}

/** 紀錄晶片上的短句：去掉頭尾空白與句尾標點；不截斷內容（關鍵資訊不能被省略號吃掉） */
export function chipLabel(t: string): string {
  return t.trim().replace(/[。！!．.]+$/u, "");
}

export type LogKind = "event" | "good" | "think" | "note";
export const LOG_LABELS: Record<LogKind, string> = { event: "發生的事", good: "做得好", think: "可以再想想", note: "紀錄" };

/** 紀錄的一行小結，例如「做得好 2・可以再想想 1」；沒有的種類不列 */
export function logSummary(counts: Record<LogKind, number>): string {
  return (Object.keys(LOG_LABELS) as LogKind[]).filter(k => counts[k] > 0).map(k => `${LOG_LABELS[k]} ${counts[k]}`).join("・");
}

/** 對話框內容區寬度：跟 play.module.css 的 .sheet（左右各 10px、上限 640／桌機 720）與 node.module.css 的 .box（內距 16／桌機 24、邊框 2）一致 */
export function boxInner(viewW: number): number {
  const wide = viewW >= 900;
  const box = Math.min(viewW - 20, wide ? 720 : 640);
  return box - (wide ? 48 : 32) - 4;
}

/** 對話框整體的目標高度：約畫面的 share（預設四成），露出貓和房間；畫面很矮時至少 160。
 *  寬螢幕（viewW ≥ 1024，渝茜 2026-11-14）放寬到約 56%，讓健康聲明和選項盡量同一頁（play.module.css 的 .sheet 同步加高） */
export function fitBudget(viewH: number, share = 0.4, viewW = 0): number {
  return Math.max(160, Math.round(viewH * (viewW >= WIDE_W ? Math.max(share, WIDE_SHARE) : share)));
}
export const WIDE_W = 1024;
export const WIDE_SHARE = 0.56;

/** 選項：內容寬 480 以上排兩欄；估每個按鈕的高度（會換行），放不下就分頁。回傳欄數與每頁的選項索引 */
export function optionPages(labels: string[], inner: number, avail: number, fontPx: number): { cols: 1 | 2; pages: number[][] } {
  const cols: 1 | 2 = inner >= 480 && labels.length > 1 ? 2 : 1;
  const gap = 8;
  const colW = (inner - (cols - 1) * gap) / cols;
  const textW = Math.max(40, colW - 32 - 4 - 24 - 10); // 內距、邊框、貓掌、間距
  const h = labels.map(l => Math.max(52, Math.ceil(estimateTextWidth(l, fontPx) / textW) * fontPx * 1.5 + 20) + 3);
  const rows: number[][] = [];
  for (let i = 0; i < labels.length; i += cols) rows.push(Array.from({ length: Math.min(cols, labels.length - i) }, (_, k) => i + k));
  const pages = pageBreaks(rows.map(r => Math.max(...r.map(i => h[i]))), avail, gap);
  return { cols, pages: pages.map(p => p.flatMap(r => rows[r] ?? [])) };
}

/** 一句台詞（名牌＋至少兩行）估計高度 */
export function sayHeight(t: string, inner: number, fontPx = 17): number {
  return 50 + Math.max(2, Math.ceil(estimateTextWidth(t, fontPx) / inner)) * fontPx * 1.7;
}
/** 健康聲明區塊估計高度（圖示＋內距） */
export function healthHeight(note: string, inner: number, fontPx = 17): number {
  return Math.ceil(estimateTextWidth(note, fontPx) / Math.max(40, inner - 50)) * fontPx * 1.7 + 30;
}
/** 台詞＋健康聲明（＋下面還要放的 extra，例如一列選項）放不下時，健康聲明自己一頁（內容不刪，只是分頁） */
export function healthOwnPage(viewW: number, viewH: number, sayText: string, note: string, extra = 60): boolean {
  const inner = boxInner(viewW);
  const chrome = (viewW >= 900 ? 32 : 24) + 4 + 24 + 30 + 56;
  return chrome + sayHeight(sayText, inner) + healthHeight(note, inner) + extra > fitBudget(viewH, 0.5, viewW);
}
