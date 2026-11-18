import { parse, type DefaultTreeAdapterTypes } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

export const reportImageName = /^[a-f0-9]{64}\.(jpg|png)$/;
const assetPath = /^html-assets\/([a-f0-9]{64}\.(jpg|png))$/;

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
const source = (node: Element | undefined) => node
  ? assetPath.exec(attr(node, "src") ?? "")?.[0] : undefined;

function labeledText(article: Element, label: string) {
  const paragraph = elements(article, node => node.tagName === "p").find(node => {
    const first = node.childNodes[0];
    return first && "tagName" in first && first.tagName === "b" && content(first) === label;
  });
  return paragraph?.childNodes.slice(1).map(content).join("").trim();
}

export function parseReportPresentation(html: string) {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const images = elements(doc, node => node.tagName === "img");
  const assets = new Set(images.flatMap(img => {
    const path = source(img);
    return path ? [path.slice("html-assets/".length)] : [];
  }));
  const body = elements(doc, node => node.tagName === "body")[0];
  const header = body?.childNodes.find(node => "tagName" in node && node.tagName === "header");
  const headerStart = header?.sourceCodeLocation?.startOffset;
  const metadata = header && elements(header, node => node.tagName === "p" && !hasClass(node, "kicker"))
    .map(node => content(node).trim()).filter(Boolean).join(" · ");
  const headerEnd = header?.sourceCodeLocation?.endOffset;
  const bodyEnd = body?.sourceCodeLocation?.endTag?.startOffset;
  const priorityHeading = elements(doc, node => node.tagName === "h3" && content(node).trim() === "優先採取的行動")[0];
  const siblings = priorityHeading?.parentNode?.childNodes;
  const priorityList = priorityHeading && siblings?.slice(siblings.indexOf(priorityHeading) + 1)
    .find(node => "tagName" in node);
  const priority = priorityList && "tagName" in priorityList && priorityList.tagName === "ol"
    ? elements(priorityList, node => node.tagName === "strong").map(node => content(node).trim()) : [];

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
      const originalImage = figureImage(original);
      const detail = elements(article, node => node.tagName === "div" && !!hasClass(node, "pair") && !!hasClass(node, "detail"))[0];
      const before = originalImage ?? (detail && figureImage(figure(detail, "改善前局部｜原圖")));
      const after = originalImage ? figureImage(figure(pair, "改善後｜AI 模擬示意"))
        : detail && figureImage(figure(detail, "改善後局部｜AI 模擬示意"));
      const note = elements(article, node => !!hasClass(node, "position-note"))[0];
      const position = note ? content(note) : "";
      const marker = original && elements(original, node => node.tagName === "svg" && !!hasClass(node, "evidence-marker"))[0];
      const rect = marker && elements(marker, node => node.tagName === "rect")[0];
      const box = rect && ["x", "y", "width", "height"].map(key => attr(rect, key) ?? "");
      const values = box?.map(Number);
      const human = position.includes("Before 實線為人工確認位置");
      const estimated = position.includes("Before 實線為 AI 估計範圍");
      const region = originalImage && values && box?.every(value => /^\d+(?:\.\d+)?$/.test(value))
        && attr(marker!, "viewBox") === "0 0 100 100"
        && values[2] > 0 && values[3] > 0
        && values[0] + values[2] <= 100.00001 && values[1] + values[3] <= 100.00001
        && (human || estimated) ? { values, estimated } : undefined;
      return [{ name, impact, action, observation, before, after, region, cropped: !originalImage, uncertainty: labeledText(article, "待現場確認") }];
    });
  // Worker already deduplicates its ordered priority list by reading group.
  // Show a single candidate even when a hazard appears in multiple comparisons.
  const firstPriority = priority[0];
  const selected = firstPriority
    ? candidates.find(item => item.name === firstPriority && item.before)
      ?? candidates.find(item => item.name === firstPriority)
    : candidates.find(item => item.before);

  return { assets, selected, headerStart, headerEnd, bodyEnd, images, metadata };
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
.meow-hero b{color:var(--red);font-size:15px}
.meow-priority h2{font-size:clamp(22px,3.5vw,36px);line-height:1.2;margin:2px 0 0}
.meow-grid{display:grid;grid-template-columns:minmax(0, 1.45fr) minmax(0, 1fr);gap:14px;align-items:start}
.meow-grid.solo{grid-template-columns:minmax(0,1fr)}
.meow-priority figure{min-width:0;background:var(--blue);border-radius:var(--radius);padding:12px}
.meow-priority figcaption{font-size:15px;margin:0 0 8px}
.meow-priority .evidence{position:relative}
.meow-priority img{width:100%;height:auto;max-height:none;border-radius:8px}
.meow-priority .region{position:absolute;box-sizing:border-box;border:3px solid var(--red);pointer-events:none;box-shadow:0 0 0 1px white}
.meow-priority .estimated{border-style:dashed}
.meow-priority figure p{margin-top:8px;font-size:14px}
.meow-guidance{display:grid;gap:12px}
.meow-card{border-radius:var(--radius);padding:clamp(12px,2vw,20px)}
.meow-card h3{margin:0 0 4px;font-size:14px}
.meow-card p{font-size:clamp(17px,2vw,21px);font-weight:700;line-height:1.45}
.meow-impact{background:var(--red-soft);color:var(--red)}
.meow-action{background:var(--green-soft);color:var(--green)}
.meow-priority .meow-after{background:white;border:1px solid var(--line);max-width:320px}
.meow-limits{background:var(--blue);padding:12px 16px;border-radius:12px;margin-top:14px}
.meow-limits .meow-icon{width:28px;color:var(--navy)}
.meow-limits strong{display:block}
.meow-report-toggle,.meow-report-pdf{display:inline-flex;align-items:center;gap:8px;min-height:44px;margin:8px 12px 4px 0}
.meow-report-toggle{padding:0 16px;border-radius:999px;background:#103b5b;color:white;text-decoration:none;font-weight:700}
.meow-report-pdf{color:#103b5b}
.meow-report-toggle .meow-icon,.meow-report-pdf .meow-icon{width:21px}
.meow-report-toggle:focus-visible,.meow-report-pdf:focus-visible{outline:2px solid #103b5b;outline-offset:3px}
@media(max-width:650px){.meow-grid{grid-template-columns:minmax(0,1fr)}.meow-priority figure{padding:8px}.meow-banner{gap:8px}}
</style>`;

const iconPaths = {
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/>',
  alert: '<path d="M10.3 4a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.7-3l8-14Z"/><path d="M12 9v4m0 4h.01"/>',
  cord: '<path d="M12 2v4c0 3-5 5-5 10a5 5 0 0 0 10 0c0-4-4-6-5-10m0 0 3-4"/>',
  cable: '<path d="M8 3v4m4-4v4M6 7h8v2a4 4 0 0 1-4 4v4a3 3 0 0 0 6 0v-2a3 3 0 0 1 6 0v4"/>',
  window: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M4 12h16"/>',
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
  return "alert";
}

const icon = (name: keyof typeof iconPaths) =>
  `<svg class="meow-icon" data-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;

export function renderReportPresentation(html: string, full: boolean, presentation = parseReportPresentation(html)) {
  const { selected, headerStart, headerEnd, bodyEnd, images, metadata } = presentation;
  if (headerStart === undefined || headerEnd === undefined || bodyEnd === undefined || headerEnd > bodyEnd) return html;

  const impact = selected && summarizeImpact(selected.impact);
  const limits = [...new Set([...(impact?.limits ?? []), selected?.uncertainty]
    .filter(Boolean).map(text => text!.replace(/。$/, "")))];
  const region = selected?.region;
  const marker = region ? `<span aria-hidden="true" class="region${region.estimated ? " estimated" : ""}" style="${["left","top","width","height"].map((key, index) => `${key}:${region.values[index]}%`).join(";")}"></span>` : "";
  const before = selected?.before ? `<figure><figcaption>${selected.cropped ? "改善前｜危害局部" : "改善前｜原始影格"}</figcaption>
    <div class="evidence"><img src="${selected.before}" alt="${escape(selected.name)}的${selected.cropped ? "原始局部" : "原始影格"}" fetchpriority="high">${marker}</div>
    <p>${region ? region.estimated ? "紅色虛線為 AI 估計位置。" : "紅框為人工確認位置。" : "畫面中的具體位置待確認。"}</p>
    <p>${escape(selected.observation)}</p></figure>` : "";
  const after = selected?.before && selected.after ? `<figure class="meow-after"><figcaption>改善後｜AI 模擬示意</figcaption>
    <img src="${selected.after}" alt="${escape(selected.name)}的 AI 改善示意" fetchpriority="low"><p>實際改善情形仍待現場確認。</p></figure>` : "";
  const collapse = `<a class="meow-report-toggle" href="html#report-view">收合完整報告${icon("up")}</a>`;
  const toggle = full ? collapse
    : `<a class="meow-report-toggle" href="?view=full#report-view">展開完整圖文報告${icon("down")}</a>`;
  const banner = `<header class="meow-banner"><div><p>MeowHome｜AI 居家環境安全檢測</p>
    <h1>你的居家安全檢測結果</h1>${metadata ? `<p>${escape(metadata)}</p>` : ""}</div>${icon("shield")}</header>`;
  const intro = `<section class="meow-priority" aria-labelledby="priority-title">
    <div class="meow-hero">${icon(selected ? hazardIcon(selected.name) : "alert")}<div>
    <b>優先查核</b><h2 id="priority-title">${selected ? escape(selected.name) : "優先危害需要進一步確認"}</h2></div></div>
    ${selected ? `${before ? "" : `<p>${escape(selected.observation)}</p>`}<div class="meow-grid${before ? "" : " solo"}">${before}<div class="meow-guidance">
      <div class="meow-card meow-impact">${icon("alert")}<div><h3>可能造成的後果</h3><p>${escape(impact!.consequence)}</p></div></div>
      <div class="meow-card meow-action">${icon("action")}<div><h3>現在可以怎麼做</h3><p>${escape(selected.action)}</p></div></div>
      ${after}</div></div>` : ""}
    ${limits.length ? `<div class="meow-limits">${icon("info")}<p><strong>仍需現場確認</strong> ${limits.map(escape).join("。")}。</p></div>` : ""}
    <div id="report-view" tabindex="-1">${toggle}<a class="meow-report-pdf" href="pdf">${icon("file")}下載完整 PDF</a></div></section>`;
  const start = html.slice(0, headerStart) + summaryStyles + banner + intro;
  if (!full) return start + html.slice(bodyEnd);

  // Apply lazy loading to the existing detail images without rewriting evidence markup.
  let detail = html.slice(headerEnd, bodyEnd);
  for (const image of [...images].reverse()) {
    const start = image.sourceCodeLocation?.startOffset;
    if (start === undefined || start < headerEnd || start >= bodyEnd || attr(image, "loading")) continue;
    const offset = start - headerEnd + "<img".length;
    detail = detail.slice(0, offset) + ' loading="lazy"' + detail.slice(offset);
  }
  return start + '<main id="full-report">' + detail + collapse + '</main>' + html.slice(bodyEnd);
}
