import { expect, it } from "vitest";
import { parseReportPresentation, renderReportPresentation } from "./report-presentation";

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
  const output = renderReportPresentation(html, false);
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
  const output = renderReportPresentation(report(candidate("書桌附近", "a", "", "90")), false);
  expect(output).toContain(path("a"));
  expect(output).not.toContain('class="region estimated"');
  expect(output).not.toContain("改善後｜AI 模擬示意");
});

it("does not associate a different comparison with an unmatched priority or trust markup as text", () => {
  const html = report(candidate("沙發附近", "c", "b"));
  const output = renderReportPresentation(html, false);
  expect(output).toContain("需要進一步確認");
  expect(output).not.toContain(path("c"));
  expect(renderReportPresentation(report(candidate("&lt;線材&gt;", "a", "b"), "&lt;線材&gt;"), false))
    .toContain('<h2 id="priority-title">&lt;線材&gt;</h2>');
});

it.each([
  ["垂下的環狀拉繩", "cord"],
  ["外露電線", "cable"],
  ["未確認的紗窗", "window"],
  ["家具邊緣", "alert"],
])("uses a fixed decorative SVG for %s", (name, icon) => {
  const output = renderReportPresentation(report(candidate(name, "a", "b"), name), false);
  expect(output).toContain(`class="meow-hero"><svg class="meow-icon" data-icon="${icon}"`);
  expect(output).toContain('aria-hidden="true" focusable="false"');
  expect(output).not.toMatch(/極高風險|危險指數|<script/);
  expect(output.match(/<img /g)).toHaveLength(2);
  expect(output).toContain('fetchpriority="high"');
  expect(output).toContain('fetchpriority="low"');
  expect(output.indexOf(path("a"))).toBeLessThan(output.indexOf("可能造成的後果"));
  expect(output.indexOf("現在可以怎麼做")).toBeLessThan(output.indexOf(path("b")));
});

it("escapes markup-like text in the header and guidance", () => {
  const html = report(candidate("書桌附近", "a", "b").replace("固定線材", "&lt;img src=x onerror=alert(1)&gt;"))
    .replace("</header>", "<p>&lt;svg onload=alert(1)&gt;</p></header>");
  const output = renderReportPresentation(html, false);
  expect(output).toContain("&lt;svg onload=alert(1)&gt;");
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
  const output = renderReportPresentation(html, false);
  expect(output).toContain("改善前｜危害局部");
  expect(output).toContain(path("d"));
  expect(output).toContain(path("e"));
  expect(output).not.toContain(path("b"));
  expect(output).not.toContain('class="region estimated"');
});

it("condenses a stated mitigation goal without losing uncertainty from the source", () => {
  const html = report(candidate("書桌附近", "a", "b").replace("若接觸可能纏繞",
    "看見拉繩；影片不能確認線材是否通電。；降低貓纏住繩圈而受傷的可能。"));
  const output = renderReportPresentation(html, false);
  expect(output).toContain("貓可能纏住繩圈而受傷。");
  expect(output).toContain("影片不能確認線材是否通電");
});
