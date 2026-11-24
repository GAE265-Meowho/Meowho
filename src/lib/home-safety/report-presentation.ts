import type { ReportView } from "./report-view-contract";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { isReportUuid } from "./report-access";
import { reportDashboardCopy } from "./report-dashboard-copy";
import { reportDashboardStyles } from "./report-dashboard-styles";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

export const reportImageName = /^[a-f0-9]{64}\.(jpg|png|webp)$/;
const assetPath = /^html-assets\/([a-f0-9]{64}\.(jpg|png|webp))$/;

function elements(node: Node, predicate: (element: Element) => boolean): Element[] {
  const result: Element[] = [];
  if ("tagName" in node && predicate(node)) result.push(node);
  if ("childNodes" in node) {
    for (const child of node.childNodes) result.push(...elements(child, predicate));
  }
  return result;
}

const attr = (node: Element, name: string) => node.attrs.find(item => item.name === name)?.value;
const hasClass = (node: Element, name: string) => attr(node, "class")?.split(/\s+/).includes(name);
const content = (node: Node): string => "value" in node ? node.value
  : "childNodes" in node ? node.childNodes.map(content).join("") : "";
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));
const originalSource = (node: Element) => assetPath.exec(attr(node, "src") ?? "")?.[0];
const webpSource = (node: Element) => {
  const candidate = attr(node, "data-webp");
  return originalSource(node) && candidate?.endsWith(".webp") && assetPath.test(candidate) ? candidate : undefined;
};
const source = (node: Element | undefined) => node && (webpSource(node) ?? originalSource(node));

function labeledText(article: Element, label: string) {
  const paragraph = elements(article, node => node.tagName === "p").find(node => {
    const first = node.childNodes[0];
    return first && "tagName" in first && first.tagName === "b" && content(first) === label;
  });
  return paragraph?.childNodes.slice(1).map(content).join("").trim();
}

function markerValues(figure: Element, simulated: boolean) {
  const markers = elements(figure, node => node.tagName === "svg" && !!hasClass(node, "evidence-marker")
    && Boolean(hasClass(node, "simulated")) === simulated);
  if (markers.length !== 1 || attr(markers[0], "viewBox") !== "0 0 100 100") return;
  const rects = elements(markers[0], node => node.tagName === "rect");
  if (rects.length !== 1) return;
  const box = ["x", "y", "width", "height"].map(key => attr(rects[0], key) ?? "");
  if (!box.every(value => /^\d+(?:\.\d+)?$/.test(value))) return;
  const [x, y, width, height] = box.map(Number);
  if (width > 0 && height > 0 && x + width <= 100.00001 && y + height <= 100.00001) return [x, y, width, height];
}

export function parseReportPresentation(html: string) {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const images = elements(doc, node => node.tagName === "img");
  const assets = new Set(images.flatMap(img => {
    return [originalSource(img), webpSource(img)].flatMap(path => path ? [path.slice("html-assets/".length)] : []);
  }));
  const body = elements(doc, node => node.tagName === "body")[0];
  const header = body?.childNodes.find(node => "tagName" in node && node.tagName === "header");
  const headerStart = header?.sourceCodeLocation?.startOffset;
  const headerEnd = header?.sourceCodeLocation?.endOffset;
  const bodyEnd = body?.sourceCodeLocation?.endTag?.startOffset;
  const priorityHeading = elements(doc, node => node.tagName === "h3" && content(node).trim() === "優先採取的行動")[0];
  const siblings = priorityHeading?.parentNode?.childNodes;
  const priorityList = priorityHeading && siblings?.slice(siblings.indexOf(priorityHeading) + 1)
    .find(node => "tagName" in node);
  const priorityEntries = priorityList && "tagName" in priorityList && priorityList.tagName === "ol"
    ? elements(priorityList, node => node.tagName === "li").flatMap(row => {
      const label = elements(row, node => node.tagName === "strong")[0];
      if (!label) return [];
      const name = content(label).trim();
      const action = content(row).trim().slice(name.length).replace(/^\s*[·：:]\s*/, "").trim();
      return name ? [{ name, action }] : [];
    })
    : [];

  const candidates = elements(doc, node => node.tagName === "article" && !!hasClass(node, "comparison"))
    .flatMap(article => {
      if (elements(article, node => !!hasClass(node, "draft")).length) return [];
      const title = elements(article, node => node.tagName === "h2")[0];
      const name = title ? content(title).trim() : "";
      const impact = labeledText(article, "可能影響");
      const action = labeledText(article, "實際改善");
      const observation = labeledText(article, "直接觀察");
      if (!name || name.endsWith("可選環境改善") || !impact || !action || !observation) return [];
      const pair = elements(article, node => node.tagName === "div" && !!hasClass(node, "pair") && !hasClass(node, "detail"))[0];
      if (!pair) return [];
      const figure = (section: Element, label: string) =>
        elements(section, node => node.tagName === "figure").find(node =>
          elements(node, item => item.tagName === "figcaption" && content(item).trim() === label).length);
      const figureImage = (node: Element | undefined) => node && source(elements(node, child => child.tagName === "img")[0]);
      const original = figure(pair, "改善前｜原始影格");
      const simulation = figure(pair, "改善後｜AI 模擬示意");
      const originalImage = figureImage(original);
      const simulatedImage = figureImage(simulation);
      const detail = elements(article, node => node.tagName === "div" && !!hasClass(node, "pair") && !!hasClass(node, "detail"))[0];
      const detailBefore = detail && figureImage(figure(detail, "改善前局部｜原圖"));
      const detailAfter = detail && figureImage(figure(detail, "改善後局部｜AI 模擬示意"));
      const before = originalImage ?? detailBefore;
      const after = originalImage ? simulatedImage : detailAfter;
      const note = elements(article, node => !!hasClass(node, "position-note"))[0];
      const position = note ? content(note) : "";
      const human = position.includes("Before 實線為人工確認位置");
      const estimated = position.includes("Before 實線為 AI 估計範圍");
      const values = originalImage && original && (human || estimated) ? markerValues(original, false) : undefined;
      const region = values ? { values, estimated } : undefined;
      const afterRegion = originalImage && simulatedImage && simulation && position.includes("After 虛線為場景對位區域。")
        ? markerValues(simulation, true) : undefined;
      return [{ caseId: attr(article, "id"), name, impact, action, observation, before, after, detailBefore, detailAfter, region, afterRegion, cropped: !originalImage, uncertainty: labeledText(article, "待現場確認") }];
    });
  // A legacy title alone does not establish that two views show the same place.
  const byAction = new Map<string, (typeof candidates)[number]>();
  for (const item of candidates) {
    const key = JSON.stringify([item.name, item.action, item.observation]);
    const existing = byAction.get(key);
    if (!existing || (!existing.before && item.before)) byAction.set(key, item);
  }
  const withoutImages = { before: undefined, after: undefined, region: undefined, afterRegion: undefined, cropped: false, detailBefore: undefined, detailAfter: undefined };
  const legacyItems = [...byAction.values()];
  function legacyRank(name: string) {
    const position = priorityEntries.findIndex(entry => entry.name === name);
    return position < 0 ? priorityEntries.length : position;
  }
  for (const entry of priorityEntries) {
    if (entry.action && !legacyItems.some(item => item.name === entry.name)) {
      legacyItems.push({ ...withoutImages, ...entry, caseId: undefined, observation: "", impact: "", uncertainty: undefined });
    }
  }
  const index = elements(doc, node => node.tagName === "ol" && attr(node, "id") === "report-improvements")[0];
  const items = index ? elements(index, node => node.tagName === "li").flatMap(row => {
    const name = attr(row, "data-label");
    const action = attr(row, "data-action");
    if (!name || !action) return [];
    const caseId = attr(row, "data-case");
    const evidence = caseId && candidates.find(item => item.caseId === caseId && item.name === name);
    return [{
      ...(evidence || { observation: attr(row, "data-observation") ?? "", ...withoutImages }),
      name, action, impact: attr(row, "data-impact") ?? "", uncertainty: attr(row, "data-uncertainty"),
    }];
  }) : legacyItems.sort((a, b) => legacyRank(a.name) - legacyRank(b.name));

  const overview = elements(doc, node => node.tagName === "section" && !!hasClass(node, "report-statistics"))[0];
  const counts = new Map<string, number>();
  if (overview) {
    for (const entry of elements(overview, node => node.tagName === "dt")) {
      const siblings = entry.parentNode?.childNodes.filter((child): child is Element => "tagName" in child);
      const value = siblings?.[siblings.indexOf(entry) + 1];
      const raw = value?.tagName === "dd" ? content(value).trim() : "";
      if (/^\d{1,5}$/.test(raw)) counts.set(content(entry).trim(), Number(raw));
    }
  }
  return { assets, items, headerStart, headerEnd, bodyEnd, images, counts };
}

const iconPaths = {
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/>',
  alert: '<path d="M10.3 4a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.7-3l8-14Z"/><path d="M12 9v4m0 4h.01"/>',
  cord: '<path d="M12 2v4c0 3-5 5-5 10a5 5 0 0 0 10 0c0-4-4-6-5-10m0 0 3-4"/>',
  cable: '<path d="M8 3v4m4-4v4M6 7h8v2a4 4 0 0 1-4 4v4a3 3 0 0 0 6 0v-2a3 3 0 0 1 6 0v4"/>',
  window: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M4 12h16"/>',
  furniture: '<path d="M5 21V4h14v17M5 11h14M5 17h14"/>',
  object: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M4 11h16m-10 4h4"/>',
  action: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8 14 2.5 2.5 5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h8"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5m-10-13v6m-3-3h6"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cat: '<path d="M3 13 4 3l5 5a13 13 0 0 1 6 0l5-5 1 10c2 8-4 9-9 9s-11-1-9-9Z"/>',
  paw: '<path fill="currentColor" stroke="none" d="M12 10c3 0 3.8 3 6 5 3 4-1 7-4 5a4 4 0 0 0-4 0c-3 2-7-1-4-5 2.2-2 3-5 6-5Z"/><ellipse cx="3.5" cy="10" rx="2.1" ry="2.7" fill="currentColor" stroke="none"/><ellipse cx="8.5" cy="5.7" rx="2.1" ry="2.7" fill="currentColor" stroke="none"/><ellipse cx="15.5" cy="5.7" rx="2.1" ry="2.7" fill="currentColor" stroke="none"/><ellipse cx="20.5" cy="10" rx="2.1" ry="2.7" fill="currentColor" stroke="none"/>',
} as const;

function hazardIcon(name: string): keyof typeof iconPaths {
  if (/拉繩|繩圈|繩帶|環狀繩/.test(name)) return "cord";
  if (/電線|插座|線材/.test(name)) return "cable";
  if (/窗戶|紗窗/.test(name)) return "window";
  if (/家具|櫃|層架/.test(name)) return "furniture";
  if (/小物|零件/.test(name)) return "object";
  return "alert";
}

const icon = (name: keyof typeof iconPaths) =>
  `<svg class="meow-icon" data-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;

function marker(values: number[] | undefined, variant: string) {
  if (!values) return "";
  const style = ["left", "top", "width", "height"].map((key, index) => `${key}:${values[index]}%`).join(";");
  return `<span aria-hidden="true" class="region${variant}" style="${style}"></span>`;
}

// The sandbox disables native img lazy loading in Chrome. A CSS image is
// requested only once its open panel applies content, without adding scripts.
function evidenceImage(path: string, alt: string) {
  if (!assetPath.test(path)) return "";
  return `<span class="meow-evidence-image" role="img" aria-label="${escape(alt)}" style="--evidence-image:url('${path}')"></span>`;
}

function detailFigure(side: "before" | "after", caption: string, image: string | undefined) {
  const label = side === "before" ? "改善前" : "改善後";
  return `<figure class="meow-${side}-detail">${image && assetPath.test(image)
    ? `<figcaption>${label}</figcaption><a href="${image}" aria-label="放大${caption}"><div class="meow-photo">${evidenceImage(image, caption)}</div></a>`
    : "<p>此報告未提供這張局部影像。</p>"}</figure>`;
}

function preloadEvidence(items: ReturnType<typeof parseReportPresentation>["items"]) {
  const images = new Set<string>();
  for (const item of items) {
    if (!item.before) continue;
    const paths = item.cropped
      ? [item.before, item.after]
      : [item.before, item.after, item.detailBefore, item.detailAfter];
    for (const path of paths) {
      if (path?.endsWith(".webp") && assetPath.test(path)) images.add(path);
    }
  }
  // Match the CSS image request so Chromium can reuse the response within this report.
  return [...images].map(path => `<link rel="preload" as="image" href="${path}" type="image/webp" media="(min-width: 651px)" fetchpriority="low">`).join("");
}


export function renderReportPresentation(html: string, full: boolean, presentation = parseReportPresentation(html), itemIndex?: number, view?: ReportView, homeId?: string) {
  const { items, headerStart, headerEnd, bodyEnd, images } = presentation;
  if (headerStart === undefined || headerEnd === undefined || bodyEnd === undefined || headerEnd > bodyEnd) return html;

  const pdf = `<a class="meow-report-pdf" href="pdf">${icon("download")}下載完整 PDF</a>`;
  if (!full) return html.slice(0, headerStart) + preloadEvidence(items) + reportDashboardStyles
    + dashboard(presentation, itemIndex, view, homeId, pdf) + html.slice(bodyEnd);

  const collapse = `<a class="meow-report-toggle" href="html#report-view" id="report-view-return">收合完整報告${icon("up")}</a>`;
  const toolbarStyle = '<style>#full-report>.meow-report-toggle,#full-report>.meow-report-pdf{display:inline-flex;align-items:center;gap:8px;min-height:44px}#full-report>.meow-report-toggle .meow-icon,#full-report>.meow-report-pdf .meow-icon{width:21px}</style>';
  return html.slice(0, headerEnd) + toolbarStyle + '<main id="full-report">' + collapse + "　" + pdf
    + renderFullEvidence(html, headerEnd, bodyEnd, images) + '</main>' + html.slice(bodyEnd);
}

function stat(label: string, count: number | undefined, symbol: keyof typeof iconPaths, kind: string, unit: string) {
  if (count === undefined) return "";
  return `<div class="meow-stat meow-stat-${kind}">${icon(symbol)}<div><span>${label}</span> <strong>${count}</strong> ${unit}</div></div>`;
}

function dashboard(presentation: ReturnType<typeof parseReportPresentation>, itemIndex: number | undefined, view: ReportView | undefined, homeId: string | undefined, pdf: string) {
  const { items, counts } = presentation;
  const history = homeId && isReportUuid(homeId) ? `/homes/${homeId}/safety` : "/me";
  const toggle = (symbol: "down" | "arrow") => `<a class="meow-report-toggle" href="?view=full#report-view-return">展開完整圖文報告${icon(symbol)}</a>`;
  const nav = `<nav class="meow-nav" aria-label="MeowHome 居家安全檢測">
    <a class="meow-brand" href="/me">${icon("cat")}MeowHome｜AI 居家環境安全檢測</a>
    <div class="meow-nav-links"><a href="#report-view" aria-current="page">檢測報告</a><a href="${history}">歷史紀錄</a><a href="/me">我的空間</a><a class="meow-profile" href="/me" aria-label="返回我的喵戶">${icon("profile")}</a></div></nav>`;
  const statistics = stat("需要改善", items.length, "alert", "primary", "項")
    + stat("待現場確認", view?.statistics.confirmations ?? counts.get("需要現場確認"), "search", "confirm", "項")
    + stat("危害類型", view?.statistics.hazards.length ?? counts.get("已分類危害類型"), "info", "types", "種");
  const banner = `<header class="meow-banner"><div class="meow-hero-art" aria-hidden="true"></div>
    <div class="meow-banner-heading"><span class="meow-icon-tile">${icon("shield")}</span><div><h1>你的居家安全檢測結果</h1>
    <p>先處理貓可能接觸的居家風險。</p></div></div><div class="meow-stats">${statistics}</div>
    <div class="meow-banner-actions">${toggle("down")}${pdf}</div></header>`;
  const rows = items.map((item, index) => improvement(item, index, index === itemIndex)).join("");
  const empty = "<p>目前未列出改善項目。可查看完整報告及查核建議。</p>";
  const confirmations = view?.confirmations.length ? `<details class="meow-analysis meow-report-checks"><summary>查看所有待現場確認事項${icon("down")}</summary>
    <ul>${view.confirmations.map(check => `<li><strong>${escape(check.label)}</strong>　${check.conditions.map(escape).join("；")}</li>`).join("")}</ul></details>` : "";
  return `${nav}<main class="meow-dashboard" id="report-view" tabindex="-1">${banner}
    <section class="meow-priority" aria-labelledby="priority-title"><div class="meow-section-heading">
    ${icon("paw")}<h2 id="priority-title">優先改善項目</h2><span class="meow-count">共 ${items.length} 項</span>
    ${items.length ? '<span class="meow-order">依報告順序</span>' : ""}</div>${rows || empty}${confirmations}</section>
    <section class="meow-footer" aria-labelledby="meow-full-title"><div class="meow-footer-art" aria-hidden="true"></div>
    <div class="meow-footer-copy"><span class="meow-icon-tile">${icon("file")}</span><div><h2 id="meow-full-title">完整詳細報告</h2>
    <p>查看完整分析、風險說明與改善建議。</p></div></div>${toggle("arrow")}</section></main>`;
}

function improvement(item: ReturnType<typeof parseReportPresentation>["items"][number], index: number, open: boolean) {
  const copy = reportDashboardCopy(item.impact, item.action, item.uncertainty);
  const { region, afterRegion } = item;
  const panelId = `improvement-${index + 1}`;
  const actions = `<section class="meow-card meow-action"><h3>${icon("action")}建議行動</h3><ol>${copy.actions.map(action => `<li>${escape(action)}</li>`).join("")}</ol></section>`;
  const checks = copy.checks.length ? `<section class="meow-limits"><h3>${icon("search")}需要現場確認</h3><p>${copy.checks.map(escape).join("；")}。</p></section>` : "";
  const original = [
    ["直接觀察", item.observation], ["可能後果", item.impact], ["建議行動", item.action], ["需要現場確認", item.uncertainty],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `<p><strong>${label}</strong>　${escape(value)}</p>`).join("");
  const originalPosition = region
    ? region.estimated ? "紅色虛線為 AI 估計位置。" : "紅框為人工確認位置。"
    : "畫面中的具體位置待確認。";
  const simulatedPosition = afterRegion ? "綠色虛線為 AI 模擬對應區域。" : "這張 AI 示意圖的對應位置待確認。";
  const position = item.before ? `<p>${originalPosition}${item.after ? simulatedPosition + "實際改善情形仍待現場確認。" : ""}</p>` : "";
  const analysis = `<details class="meow-analysis"><summary>查看詳細說明${icon("down")}</summary><div class="meow-analysis-body">${original}${position}</div></details>`;
  const titleIcon = hazardIcon(item.name);
  const symbol = titleIcon === "alert" && "hazard" in item && typeof item.hazard === "string" ? hazardIcon(item.hazard) : titleIcon;
  return `<details class="meow-item"${open ? " open" : ""}><summary class="meow-hero" id="${panelId}">
    <span class="meow-hazard-icon">${icon(symbol)}</span><span class="meow-title">${escape(item.name)}</span>
    ${copy.consequence ? `<span class="meow-risk">${escape(copy.consequence)}</span>` : ""}${icon("down")}</summary>
    <div id="${panelId}-panel" class="meow-panel${item.before ? "" : " solo"}"><div class="meow-instructions">${actions}${checks}${analysis}</div>${comparison(item)}</div></details>`;
}

function comparison(item: ReturnType<typeof parseReportPresentation>["items"][number]) {
  if (!item.before) return "";
  const { region, afterRegion } = item;
  const before = `<figure class="meow-before"><figcaption>${item.cropped ? "改善前｜危害局部" : "改善前｜原始影格"}</figcaption>
    <div class="meow-photo"><div class="evidence">${evidenceImage(item.before, item.name + (item.cropped ? "的原始局部" : "的原始影格"))}${marker(region?.values, region?.estimated ? " estimated" : "")}</div></div></figure>`;
  const after = `<figure class="meow-after">${item.after ? `<figcaption>${item.cropped ? "改善後局部｜AI 模擬示意" : "改善後｜AI 模擬示意"}</figcaption>
    <div class="meow-photo"><div class="evidence">${evidenceImage(item.after, item.name + "的 AI 改善示意")}${marker(afterRegion, " simulated-region")}</div></div>`
    : "<p>這個項目沒有可展示的 AI 改善示意。</p>"}</figure>`;
  const between = `<span class="meow-between">${icon("arrow")}</span>`;
  const closeups = !item.cropped ? `<section class="meow-closeups"><h3>${icon("search")}局部對照</h3><div class="meow-compare">
    ${detailFigure("before", "改善前局部｜原圖", item.detailBefore)}${item.detailBefore && item.detailAfter ? between : ""}
    ${detailFigure("after", "改善後局部｜AI 模擬示意", item.detailAfter)}</div></section>` : "";
  return `<div class="meow-evidence-grid"><div class="meow-compare">${before}${item.after ? between : ""}${after}</div>${closeups}</div>`;
}

function renderFullEvidence(html: string, headerEnd: number, bodyEnd: number, images: ReturnType<typeof parseReportPresentation>["images"]) {
  // Apply lazy loading to the existing detail images without rewriting evidence markup.
  let detail = html.slice(headerEnd, bodyEnd);
  for (const image of [...images].reverse()) {
    const start = image.sourceCodeLocation?.startOffset;
    if (start === undefined || start < headerEnd || start >= bodyEnd) continue;
    const derivative = webpSource(image);
    const src = image.sourceCodeLocation?.attrs?.src;
    if (derivative && src) {
      detail = detail.slice(0, src.startOffset - headerEnd) + `src="${derivative}"` + detail.slice(src.endOffset - headerEnd);
    }
    if (attr(image, "loading")) continue;
    const offset = start - headerEnd + "<img".length;
    detail = detail.slice(0, offset) + ' loading="lazy"' + detail.slice(offset);
  }
  return detail;
}
