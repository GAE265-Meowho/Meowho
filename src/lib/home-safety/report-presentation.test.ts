import { expect, it } from "vitest";
import { parseReportPresentation, renderReportPresentation } from "./report-presentation";

const openedPanel = (html: string) => html.match(/<details class="meow-item" open>[\s\S]*?<\/details>/)?.[0] ?? "";
const path = (char: string) => "html-assets/" + char.repeat(64) + ".jpg";
const img = (char: string) => '<img src="' + path(char) + '">';
const candidate = (name: string, before: string, after: string, coordinate = "12") => `<article class="comparison"><h2>${name}</h2>
<p><b>直接觀察</b> 可見鬆散線圈</p>
<div class="pair">
<figure><figcaption>改善前｜原始影格</figcaption>${img(before)}
<svg class="evidence-marker" viewBox="0 0 100 100"><rect x="${coordinate}" y="25" width="30" height="40"></rect></svg></figure>
<figure><figcaption>改善後｜AI 模擬示意</figcaption>${after ? img(after) : ""}</figure></div>
<p class="position-note">Before 實線為 AI 估計範圍。</p>
<div class="pair detail">${img("d")}</div><p><b>實際改善</b> 固定線材</p>
<p><b>可能影響</b> 若接觸可能纏繞</p><p><b>待現場確認</b> 是否可接觸</p></article>`;
const report = (details: string, priority = "書桌附近") => `<!doctype html><body><header><h1>貓咪居家環境健檢報告</h1></header>
<h3>優先採取的行動</h3><ol><li><strong>${priority}</strong></li></ol>${details}</body>`;

it("matches priority to its own image pair and reuses normalized estimated coordinates", () => {
  const html = report(candidate("沙發附近", "c", "e") + candidate("書桌附近", "a", "b")
    + candidate("書桌附近", "f", "9"));
  const output = openedPanel(renderReportPresentation(html, false, undefined, 0));
  expect(output).toContain(path("a"));
  expect(output).toContain(path("b"));
  expect(output).not.toContain(path("c"));
  expect(output).not.toContain(path("d"));
  expect(output).not.toContain(path("f"));
  expect(output).toContain('class="region estimated" style="left:12%;top:25%;width:30%;height:40%"');
  expect(output).toContain("AI 估計位置");
  expect(output).toContain("若接觸可能纏繞");
});

it("retains detail markup and only enables its lazy images in the expanded response", () => {
  const html = report(candidate("書桌附近", "a", "b") + '<section id="sources">參考資料</section>');
  const expanded = renderReportPresentation(html, true);
  expect(expanded).toContain('<main id="full-report">');
  expect(expanded).toContain('<img loading="lazy" src="' + path("d"));
  expect(expanded).toContain('<section id="sources">參考資料</section>');
  expect(expanded).toContain('href="html#report-view"');
  expect(expanded).toContain('href="pdf"');
});

it("preserves the evidence without a fabricated box or After image", () => {
  const output = renderReportPresentation(report(candidate("書桌附近", "a", "", "90")), false, undefined, 0);
  expect(output).toContain(path("a"));
  expect(output).not.toContain('class="region estimated"');
  expect(output).not.toContain("改善後｜AI 模擬示意");
  expect(output).toContain("這個項目沒有可展示的 AI 改善示意。");
  expect(output).toContain("此報告未提供這張局部影像。");
  expect(output.match(/role="img"/g)).toHaveLength(1);
});

const localizedComparison = () => candidate("書桌附近", "a", "b")
  .replace(img("b"), img("b") + '<svg class="evidence-marker simulated" viewBox="0 0 100 100"><rect x="42" y="10" width="18" height="25"></rect></svg>')
  .replace("Before 實線為 AI 估計範圍。", "Before 實線為 AI 估計範圍。 After 虛線為場景對位區域。")
  .replace(img("d"), `<figure><figcaption>改善前局部｜原圖</figcaption>${img("d")}</figure>
<figure><figcaption>改善後局部｜AI 模擬示意</figcaption>${img("e")}</figure>`);

it("uses the case's independent After coordinates and its two deferred detail assets", () => {
  const html = report(localizedComparison() + candidate("其他房間", "c", "f"));
  const output = openedPanel(renderReportPresentation(html, false, undefined, 0));
  expect(output).toContain('class="region estimated" style="left:12%;top:25%;width:30%;height:40%"');
  expect(output).toContain('class="region simulated-region" style="left:42%;top:10%;width:18%;height:25%"');
  expect(output).toContain("綠色虛線為 AI 模擬對應區域。");
  expect(output).toContain(`aria-label="改善前局部｜原圖" style="--evidence-image:url('${path("d")}')"`);
  expect(output).toContain(`aria-label="改善後局部｜AI 模擬示意" style="--evidence-image:url('${path("e")}')"`);
  expect(output).not.toContain(path("f"));
  expect(renderReportPresentation(html, false)).not.toContain('<details class="meow-item" open>');
});

it.each([
  ["unrecognized provenance", "After 虛線為場景對位區域。", "After 位置待確認。"],
  ["out-of-bounds coordinates", 'x="42"', 'x="90"'],
  ["wrong figure marker type", 'class="evidence-marker simulated"', 'class="evidence-marker"'],
])("keeps both images and omits the After outline for %s", (_, from, to) => {
  const output = renderReportPresentation(report(localizedComparison().replace(from, to)), false, undefined, 0);
  expect(output).toContain('class="region estimated"');
  expect(output).not.toContain('class="region simulated-region"');
  expect(output).toContain("這張 AI 示意圖的對應位置待確認。");
  expect(output.match(/role="img"/g)).toHaveLength(4);
});

it("retains independently evidenced cases and escapes their labels", () => {
  const output = renderReportPresentation(report(candidate("&lt;線材&gt;", "a", "b")), false);
  expect(output).toContain("<span>&lt;線材&gt;</span>");
  expect(output).not.toContain('<details class="meow-item" open>');
});

it.each([0, 1, 2, 3, 5])("renders %i independent native disclosures with deferred evidence", (count) => {
  const html = report(Array.from({ length: count }, (_, i) => candidate("位置 " + i, "a", "b")).join(""));
  const closed = renderReportPresentation(html, false);
  expect(parseReportPresentation(html).items).toHaveLength(count);
  expect(closed.match(/<details class="meow-item">/g) ?? []).toHaveLength(count);
  expect(closed.match(/<summary /g) ?? []).toHaveLength(count);
  expect(closed).not.toMatch(/\?item=|<details[^>]+(?: name=| open)/);
  expect(closed).not.toContain("<img ");
  expect(closed).toContain(".meow-item[open] .meow-evidence-image{content:var(--evidence-image)}");
  expect(closed).toContain(`需要改善（${count}）`);
});

it("keeps an evidenced legacy priority action even if no comparison is available", () => {
  const html = report(candidate("窗邊的拉繩", "a", "b")).replace(
    "<strong>書桌附近</strong>", "<strong>書桌附近</strong> · 收起可接觸的線材",
  );
  expect(parseReportPresentation(html).items.map(item => item.name)).toEqual(["書桌附近", "窗邊的拉繩"]);
  const opened = renderReportPresentation(html, false, undefined, 0);
  expect(opened).toContain("收起可接觸的線材");
  expect(openedPanel(opened)).not.toContain('role="img"');
});

it("switches image pairs and retains similar names with a different action", () => {
  const html = report(candidate("左側電線", "a", "b") + candidate("左側電線", "c", "e")
    .replace("固定線材", "移除閒置線材"));
  const second = renderReportPresentation(html, false, undefined, 1);
  expect(second).toContain(path("c"));
  expect(second).toContain(path("e"));
  expect(openedPanel(second)).not.toContain(path("a"));
  expect(openedPanel(second)).toContain('id="improvement-2"');
  expect(second.match(/<details class="meow-item" open>/g)).toHaveLength(1);
});

it("uses the Worker summary as the source of truth and keeps text-only rows", () => {
  const html = report(candidate("書桌附近", "a", "b").replace("<article ", '<article id="case-1" ')
    + '<ol id="report-improvements" hidden><li data-label="書桌附近" data-action="固定線材" data-case="case-1"></li>'
    + '<li data-label="沙發旁" data-observation="可見線材" data-action="整理電線"></li></ol>');
  const opened = renderReportPresentation(html, false, undefined, 1);
  expect(opened).toContain("需要改善（2）");
  expect(opened).toContain("整理電線");
  expect(openedPanel(opened)).not.toContain('role="img"');
});

it.each([
  ["垂下的環狀拉繩", "cord"],
  ["外露電線", "cable"],
  ["未確認的紗窗", "window"],
  ["家具邊緣", "furniture"],
  ["零件", "object"],
  ["其他情況", "alert"],
])("uses a fixed decorative SVG for %s", (name, icon) => {
  const output = renderReportPresentation(report(candidate(name, "a", "b"), name), false, undefined, 0);
  expect(output).toContain(`<svg class="meow-icon" data-icon="${icon}"`);
  expect(output).toContain('aria-hidden="true" focusable="false"');
  expect(output).not.toMatch(/極高風險|危險指數|<script/);
  expect(output.match(/role="img"/g)).toHaveLength(2);
  expect(output.match(/style="--evidence-image:url/g)).toHaveLength(2);
  expect(output.indexOf("可能後果")).toBeLessThan(output.indexOf(path("a")));
  expect(output.indexOf(path("a"))).toBeLessThan(output.indexOf("建議行動"));
  expect(output.indexOf("建議行動")).toBeLessThan(output.indexOf(path("b")));
});

it("escapes markup-like text in the header and guidance", () => {
  const html = report(candidate("書桌附近", "a", "b").replace("固定線材", "&lt;img src=x onerror=alert(1)&gt;"))
    .replace("</header>", "<p>&lt;svg onload=alert(1)&gt;</p></header>");
  const output = openedPanel(renderReportPresentation(html, false, undefined, 0));
  expect(output).not.toContain("svg onload");
  expect(output).toContain("&lt;img src=x onerror=alert(1)&gt;");
  expect(output).not.toMatch(/<(svg onload|img src=x)/);
});

it("only allows actual image elements and valid report-relative paths", () => {
  const html = report('<!-- ' + img("b") + ' --><p data-src="' + path("c") + '">文字</p>'
    + img("a") + '<img src="../' + path("d") + '">');
  expect([...parseReportPresentation(html).assets]).toEqual([path("a").slice("html-assets/".length)]);
});


it("uses the same case's original crop without transferring full-frame coordinates", () => {
  const html = report(candidate("書桌附近", "a", "b")
    .replace(img("a"), "")
    .replace(img("d"), '<figure><figcaption>改善前局部｜原圖</figcaption>' + img("d") + '</figure>'
      + '<figure><figcaption>改善後局部｜AI 模擬示意</figcaption>' + img("e") + '</figure>'));
  const output = openedPanel(renderReportPresentation(html, false, undefined, 0));
  expect(output).toContain("改善前｜危害局部");
  expect(output).toContain(path("d"));
  expect(output).toContain(path("e"));
  expect(output).not.toContain(path("b"));
  expect(output).not.toContain('class="region estimated"');
});

it("condenses a stated mitigation goal without losing uncertainty from the source", () => {
  const html = report(candidate("書桌附近", "a", "b").replace("若接觸可能纏繞",
    "看見拉繩；影片不能確認線材是否通電。；降低貓纏住繩圈而受傷的可能。"));
  const output = openedPanel(renderReportPresentation(html, false, undefined, 0));
  expect(output).toContain("貓可能纏住繩圈而受傷。");
  expect(output).toContain("影片不能確認線材是否通電");
});
