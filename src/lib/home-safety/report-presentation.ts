import type { ReportView } from "./report-view-contract";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

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

  return { assets, items, headerStart, headerEnd, bodyEnd, images };
}

function summarizeImpact(impact: string) {
  // This Worker format can append a consequence as a mitigation goal after
  // the observation and its limits. Reuse the stated consequence only.
  const goal = /(?:^|[；。])\s*降低貓([^；。]+)的可能。?$/.exec(impact);
  if (!goal) return { consequence: impact, limits: [] };
  const limits = impact.slice(0, goal.index).split(/[；。]/)
    .map(clause => clause.trim())
    .filter(clause => /未確認|無法確認|不能確認|無法判定/.test(clause));
  return { consequence: "貓可能" + goal[1].trim() + "。", limits };
}

const summaryStyles = `<style>
html:has(.meow-priority){background:#f0f6f9}
body:has(.meow-priority){max-width:1120px;color:#183247}
.meow-banner,.meow-priority{--navy:#103b5b;--blue:#edf6fb;--ink:#183247;--red:#a62218;--red-soft:#fff0ee;--green:#285929;--green-soft:#eef7e7;--line:#d5e3ec;--radius:16px}
.meow-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--navy);color:white;padding:clamp(16px,3vw,32px);border:0;border-radius:var(--radius)}
.meow-banner h1{font-size:clamp(23px,3.8vw,40px);line-height:1.25;margin:4px 0 6px}
.meow-banner p{font-size:14px;margin:0;color:#d9ebf5}
.meow-banner .meow-icon{width:clamp(50px,7vw,84px);color:#c9e8f8}
.meow-icon{display:block;width:clamp(42px,5vw,60px);height:auto;flex:none}
.meow-priority{margin:clamp(12px,2vw,24px) 0;color:var(--ink);font-size:16px}
.meow-priority p{margin:0}
.meow-hero,.meow-card,.meow-limits{display:flex;align-items:center;gap:clamp(12px,2vw,20px)}
.meow-hero{background:white;border:1px solid var(--line);border-radius:var(--radius);padding:clamp(12px,2.2vw,24px);margin-bottom:14px}
.meow-hero .meow-icon{width:clamp(49px,6vw,78px);color:var(--red);background:var(--red-soft);border-radius:14px;padding:7px;box-sizing:border-box}
.meow-item{margin:12px 0}
.meow-hero{cursor:pointer;list-style:none}
.meow-hero::-webkit-details-marker{display:none}
.meow-item .meow-hero{margin:0;color:var(--ink);text-decoration:none;font-size:clamp(19px,3vw,26px);min-height:44px;overflow-wrap:anywhere}
.meow-item .meow-hero span{flex:1;min-width:0}
.meow-item .meow-hero .meow-icon:last-child{width:24px;background:none;padding:0}
.meow-item .meow-hero:focus-visible{outline:2px solid var(--navy);outline-offset:3px}
.meow-item[open]>.meow-hero{border-color:var(--navy)}
.meow-item[open]>.meow-hero .meow-icon:last-child{transform:rotate(180deg)}
.meow-item:not([open])>.meow-hero+div{display:none}
.meow-hero+div{margin-top:12px}
.meow-priority h2{font-size:clamp(22px,3.5vw,36px);line-height:1.2;margin:2px 0 0}
.meow-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"impact action" "before after";gap:14px}
.meow-grid.with-details{grid-template-areas:"impact action" "before after" "before-detail after-detail"}
.meow-grid.solo{grid-template-columns:minmax(0,1fr);grid-template-areas:"impact" "action"}
.meow-priority figure{min-width:0;margin:0;background:var(--blue);border-radius:var(--radius);padding:12px}
.meow-priority figcaption{font-size:15px;margin:0 0 8px}
.meow-priority .meow-before{grid-area:before}
.meow-priority .meow-after{grid-area:after}
.meow-priority .meow-before-detail{grid-area:before-detail}
.meow-priority .meow-after-detail{grid-area:after-detail}
.meow-photo{display:grid;place-items:center;aspect-ratio:16/9;container-type:size;background:white;border-radius:8px}
.meow-item[open] .meow-evidence-image{content:var(--evidence-image)}
.meow-photo .evidence{position:relative;max-width:100%;line-height:0}
.meow-photo img,.meow-photo .meow-evidence-image{display:block;width:auto;height:auto;max-width:100%;max-height:100cqh;object-fit:contain;border-radius:8px}
.meow-priority .region{position:absolute;box-sizing:border-box;border:3px solid var(--red);pointer-events:none;box-shadow:0 0 0 1px white}
.meow-priority .estimated{border-style:dashed}
.meow-priority .simulated-region{border-style:dashed;border-color:var(--green)}
.meow-priority figure p{margin-top:8px;font-size:14px}
.meow-card{border-radius:var(--radius);padding:clamp(12px,2vw,20px)}
.meow-card h4{margin:0 0 4px;font-size:14px}
.meow-card p{font-size:clamp(17px,2vw,21px);font-weight:700;line-height:1.45}
.meow-impact{grid-area:impact;background:var(--red-soft);color:var(--red)}
.meow-action{grid-area:action;background:var(--green-soft);color:var(--green)}
.meow-limits{background:var(--blue);padding:12px 16px;border-radius:12px;margin-top:14px}
.meow-limits .meow-icon{width:28px;color:var(--navy)}
.meow-limits strong{display:block}
.meow-report-toggle,.meow-report-pdf{display:inline-flex;align-items:center;gap:8px;min-height:44px;margin:8px 12px 4px 0}
.meow-report-toggle{padding:0 16px;border-radius:999px;background:#103b5b;color:white;text-decoration:none;font-weight:700}
.meow-report-pdf{color:#103b5b}
.meow-report-toggle .meow-icon,.meow-report-pdf .meow-icon{width:21px}
.meow-report-toggle:focus-visible,.meow-report-pdf:focus-visible{outline:2px solid #103b5b;outline-offset:3px}
@media(max-width:650px){.meow-grid{grid-template-columns:minmax(0,1fr);grid-template-areas:"impact" "before" "action" "after"}.meow-grid.with-details{grid-template-areas:"impact" "before" "before-detail" "action" "after" "after-detail"}.meow-priority figure{padding:8px}.meow-banner{gap:8px}}
</style>`;

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
  return `<figure class="meow-${side}-detail"><figcaption>${caption}</figcaption>${image
    ? `<div class="meow-photo">${evidenceImage(image, caption)}</div>`
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

export function renderReportPresentation(html: string, full: boolean, presentation = parseReportPresentation(html), itemIndex?: number, view?: ReportView) {
  const { items, headerStart, headerEnd, bodyEnd, images } = presentation;
  if (headerStart === undefined || headerEnd === undefined || bodyEnd === undefined || headerEnd > bodyEnd) return html;

  const collapse = `<a class="meow-report-toggle" href="html#report-view" id="report-view-return">收合完整報告${icon("up")}</a>`;
  const pdf = `<a class="meow-report-pdf" href="pdf">${icon("file")}下載完整 PDF</a>`;
  const toggle = `<a class="meow-report-toggle" href="?view=full#report-view-return">展開完整圖文報告${icon("down")}</a>`;
  const banner = `<header class="meow-banner"><div><p>MeowHome｜AI 居家環境安全檢測</p>
    <h1>你的居家安全檢測結果</h1></div>${icon("shield")}</header>`;
  const rows = items.map((item, index) => {
    const impact = summarizeImpact(item.impact);
    const limits = [...new Set([...(impact?.limits ?? []), item.uncertainty]
      .filter(Boolean).map(text => text!.replace(/。$/, "")))];
    const region = item.region;
    const afterRegion = item.afterRegion;
    const showDetails = Boolean(item.before && !item.cropped);
    const before = item.before ? `<figure class="meow-before"><figcaption>${item.cropped ? "改善前｜危害局部" : "改善前｜原始影格"}</figcaption>
      <div class="meow-photo"><div class="evidence">${evidenceImage(item.before, item.name + (item.cropped ? "的原始局部" : "的原始影格"))}${marker(region?.values, region?.estimated ? " estimated" : "")}</div></div>
      <p>${region ? region.estimated ? "紅色虛線為 AI 估計位置。" : "紅框為人工確認位置。" : "畫面中的具體位置待確認。"}</p>
      <p>${escape(item.observation)}</p>${!item.cropped && item.detailBefore ? `<a href="${item.detailBefore}">查看原始局部放大</a>` : ""}</figure>` : "";
    const after = item.before ? `<figure class="meow-after">${item.after ? `<figcaption>${item.cropped ? "改善後局部｜AI 模擬示意" : "改善後｜AI 模擬示意"}</figcaption>
      <div class="meow-photo"><div class="evidence">${evidenceImage(item.after, item.name + "的 AI 改善示意")}${marker(afterRegion, " simulated-region")}</div></div>
      ${item.cropped ? "" : `<p>${afterRegion ? "綠色虛線為 AI 模擬對應區域。" : "這張 AI 示意圖的對應位置待確認。"}</p>`}
      <p>實際改善情形仍待現場確認。</p>` : "<p>這個項目沒有可展示的 AI 改善示意。</p>"}</figure>` : "";
    const panelId = `improvement-${index + 1}`;
    return `<details class="meow-item"${index === itemIndex ? " open" : ""}><summary class="meow-hero" id="${panelId}">
      ${icon(hazardIcon("hazard" in item && typeof item.hazard === "string" ? item.hazard : item.name))}<span>${escape(item.name)}</span>${icon("down")}</summary>
      <div id="${panelId}-panel">${!before && item.observation ? `<p>${escape(item.observation)}</p>` : ""}<div class="meow-grid${before ? "" : " solo"}${showDetails ? " with-details" : ""}">
        ${impact?.consequence ? `<div class="meow-card meow-impact">${icon("alert")}<div><h4>可能後果</h4><p>${escape(impact.consequence)}</p></div></div>` : ""}
        ${before}
        ${showDetails ? detailFigure("before", "改善前局部｜原圖", item.detailBefore) : ""}
        <div class="meow-card meow-action">${icon("action")}<div><h4>建議行動</h4><p>${escape(item.action)}</p></div></div>
        ${after}
        ${showDetails ? detailFigure("after", "改善後局部｜AI 模擬示意", item.detailAfter) : ""}</div>
        ${limits.length ? `<div class="meow-limits">${icon("info")}<p><strong>需要現場確認</strong> ${limits.map(escape).join("。")}。</p></div>` : ""}</div></details>`;
  });
  const statistics = view ? `<p>${view.statistics.confirmations} 項需要現場確認 · ${view.statistics.hazards.length} 種已分類危害 · ${view.statistics.evidence_frames} 張原始證據影格</p>
    ${view.statistics.hazards.length ? `<ul>${view.statistics.hazards.map(hazard => `<li>${escape(hazard.label)}（${hazard.count}）</li>`).join("")}</ul>` : ""}` : "";
  const checks = view?.confirmations.length ? `<section aria-labelledby="report-checks"><h3 id="report-checks">需要現場確認</h3><ul>${view.confirmations.map(check => `<li><strong>${escape(check.label)}</strong>　${check.conditions.map(escape).join("；")}</li>`).join("")}</ul></section>` : "";
  const intro = `<section class="meow-priority" aria-labelledby="priority-title">
    <h2 id="priority-title">需要改善（${items.length}）</h2>${statistics}
    ${rows.length ? rows.join("") : "<p>目前無法從這份報告整理改善項目。可查看完整報告中的查核建議。</p>"}
    ${checks}<div id="report-view" tabindex="-1">${toggle}${pdf}</div></section>`;
  if (!full) return html.slice(0, headerStart) + preloadEvidence(items) + summaryStyles + banner + intro + html.slice(bodyEnd);

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
  return html.slice(0, headerEnd) + summaryStyles + '<main id="full-report">' + collapse + pdf + detail + '</main>' + html.slice(bodyEnd);
}
