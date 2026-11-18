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

  return { assets, selected, headerEnd, bodyEnd, images };
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
.meow-priority{--warning:#a31d23;--warning-bg:#fff4f2;--paper:#fffaf0;--border:#efe3cf;--ink:#3f2e24;margin:18px 0;padding:clamp(14px,3vw,26px);border:1px solid var(--border);border-radius:16px;background:var(--paper);color:var(--ink);font-size:16px}
.meow-priority h2{margin:0 0 12px;font-size:clamp(21px,4vw,29px)}
.meow-priority .warning{border-inline-start:4px solid var(--warning);background:var(--warning-bg);color:var(--warning);padding:12px}
.meow-priority p{margin:8px 0}.meow-priority .warning p{margin:4px 0}
.meow-priority .priority-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}
.meow-priority .priority-pair.single{grid-template-columns:minmax(0,1fr);max-width:620px}
.meow-priority figure{min-width:0}.meow-priority .evidence{position:relative}
.meow-priority img{width:100%;height:auto;max-height:none}
.meow-priority .region{position:absolute;box-sizing:border-box;border:3px solid var(--warning);pointer-events:none;box-shadow:0 0 0 1px white}
.meow-priority .estimated{border-style:dashed}
.meow-report-toggle,.meow-report-pdf{display:inline-flex;align-items:center;min-height:44px;margin:4px 16px 4px 0}
.meow-report-toggle:focus-visible,.meow-report-pdf:focus-visible{outline:2px solid currentColor;outline-offset:3px}
@media(max-width:560px){.meow-priority .priority-pair{grid-template-columns:minmax(0,1fr)}}
</style>`;

export function renderReportPresentation(html: string, full: boolean, presentation = parseReportPresentation(html)) {
  const { selected, headerEnd, bodyEnd, images } = presentation;
  if (headerEnd === undefined || bodyEnd === undefined || headerEnd > bodyEnd) return html;

  const impact = selected && summarizeImpact(selected.impact);
  const limits = [...new Set([...(impact?.limits ?? []), selected?.uncertainty]
    .filter(Boolean).map(text => text!.replace(/。$/, "")))];
  const region = selected?.region;
  const marker = region ? `<span aria-hidden="true" class="region${region.estimated ? " estimated" : ""}" style="${["left","top","width","height"].map((key, index) => `${key}:${region.values[index]}%`).join(";")}"></span>` : "";
  const pictures = selected?.before ? `<div class="priority-pair${selected.after ? "" : " single"}">
    <figure><figcaption>${selected.cropped ? "改善前｜危害局部" : "改善前｜原始影格"}</figcaption><div class="evidence"><img src="${selected.before}" alt="${escape(selected.name)}的${selected.cropped ? "原始局部" : "原始影格"}" fetchpriority="high">${marker}</div>
    <p>${region ? region.estimated ? "紅色虛線為 AI 估計位置。" : "紅框為人工確認位置。" : "畫面中的具體位置待確認。"}</p></figure>
    ${selected.after ? `<figure><figcaption>改善後｜AI 模擬示意</figcaption><img src="${selected.after}" alt="${escape(selected.name)}的 AI 改善示意"><p>實際改善情形仍待現場確認。</p></figure>` : ""}</div>` : "";

  const toggle = full
    ? '<a class="meow-report-toggle" href="html#report-view">收合完整報告</a>'
    : '<a class="meow-report-toggle" href="?view=full#report-view">展開完整圖文報告</a>';
  const intro = `${summaryStyles}<section class="meow-priority" aria-labelledby="priority-title">
    <h2 id="priority-title">安全檢測重點</h2>
    ${selected ? `<div class="warning"><strong>優先查核｜${escape(selected.name)}</strong><p><b>可能後果</b> ${escape(impact!.consequence)}</p></div>
    <p><strong>建議行動</strong> ${escape(selected.action)}</p>${pictures}
    <p><strong>畫面觀察</strong> ${escape(selected.observation)}</p>
    ${limits.length ? `<p><strong>待現場確認</strong> ${limits.map(escape).join("。")}。</p>` : ""}`
    : "<p>優先危害需要進一步確認。請展開報告查看觀察、改善建議與現場查核事項。</p>"}
    <div id="report-view" tabindex="-1">${toggle}<a class="meow-report-pdf" href="pdf">下載完整 PDF</a></div></section>`;
  if (!full) return html.slice(0, headerEnd) + intro + html.slice(bodyEnd);

  // Apply lazy loading to the existing detail images without rewriting evidence markup.
  let detail = html.slice(headerEnd, bodyEnd);
  for (const image of images.reverse()) {
    const start = image.sourceCodeLocation?.startOffset;
    if (start === undefined || start < headerEnd || start >= bodyEnd || attr(image, "loading")) continue;
    const offset = start - headerEnd + "<img".length;
    detail = detail.slice(0, offset) + ' loading="lazy"' + detail.slice(offset);
  }
  return html.slice(0, headerEnd) + intro + '<main id="full-report">' + detail
    + '<a class="meow-report-toggle" href="html#report-view">收合完整報告</a></main>' + html.slice(bodyEnd);
}
