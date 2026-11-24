// The private report is served as a standalone document under an inline-style-only CSP.
export const reportDashboardStyles = `<style>
html:has(.meow-dashboard){background:#fbf5ea}
body:has(.meow-dashboard){--ink:#3f2e24;--brand-ink:#6b3b20;--muted:#7a6252;--line:#efe3cf;--white:#fff;--red:#a5231b;--red-soft:#fbe9e7;--green:#145744;--green-soft:#eaf3ec;--mint-soft:#e3f2e7;--radius:16px;--shadow:0 6px 16px #3f2e2414;max-width:none;margin:0;padding:0;color:var(--ink);font:16px/1.55 "Microsoft JhengHei","PingFang TC","Noto Sans CJK TC",sans-serif}
body:has(.meow-dashboard)>nav{display:none}
.meow-dashboard{box-sizing:border-box;max-width:1440px;padding:0 30px 26px;margin:auto}
.meow-dashboard :is(a,summary){color:var(--brand-ink)}
.meow-dashboard a{text-decoration:none}
.meow-dashboard :is(a,summary):focus-visible{outline:2px solid var(--brand-ink);outline-offset:3px}
.meow-dashboard .meow-dashboard-back{display:inline-flex;align-items:center;gap:6px;min-height:44px;margin-bottom:6px;font-weight:700}
.meow-dashboard .meow-dashboard-back:hover{text-decoration:underline}
.meow-dashboard p{margin:0}
.meow-dashboard .meow-icon{display:block;width:23px;height:auto;flex:none}
.meow-dashboard .meow-icon-tile{display:grid;place-items:center;width:76px;aspect-ratio:1;border-radius:20px;background:var(--mint-soft);color:var(--green);flex:none}
.meow-icon-tile .meow-icon{width:47px}
.meow-banner{position:relative;isolation:isolate;overflow:hidden;min-height:235px;box-sizing:border-box;background:#fffaf3;border:1px solid var(--white);border-radius:var(--radius);box-shadow:var(--shadow);padding:29px 36px 20px}
.meow-hero-art{position:absolute;z-index:-1;inset:0;overflow:hidden}
.meow-hero-art::before,.meow-hero-art::after{content:"";position:absolute}
.meow-hero-art::before{inset:-20px;background:linear-gradient(90deg,#fffaf3f7 5%,#fffaf3dd 55%,#fffaf380),url('/home/safety-report/cover.webp') right 40%/cover no-repeat;filter:blur(16px)}
.meow-hero-art::after{inset:0 0 0 auto;width:clamp(300px,49%,540px);background:url('/home/safety-report/cover.webp') right 27%/100% auto no-repeat;mask-image:linear-gradient(90deg,transparent,black 48%)}
.meow-banner-heading,.meow-title,.meow-banner-actions,.meow-section-heading,.meow-footer-copy{display:flex;align-items:center}
.meow-banner-heading,.meow-footer-copy{gap:22px}
.meow-banner .meow-icon-tile{width:84px}
.meow-banner h1{font-size:clamp(25px,3.15vw,40px);line-height:1.2;margin:0 0 7px;color:var(--ink)}
.meow-banner p{font-size:clamp(14px,1.65vw,18px);font-weight:600;color:var(--muted)}
.meow-banner .meow-improvement-total{display:inline-flex;align-items:center;gap:10px;margin:7px 0 0;padding:0 16px;border-radius:15px;background:var(--red-soft);color:var(--red);font-size:clamp(17px,2.35vw,26px);font-weight:750}
.meow-improvement-total .meow-icon{width:1.35em}
.meow-improvement-total strong{font-size:clamp(36px,5.4vw,60px);line-height:.92;vertical-align:-.12em}
.meow-banner-actions{margin-top:16px;gap:24px;flex-wrap:wrap}
.meow-banner-actions .meow-report-toggle::after{content:"";width:1px;height:24px;margin-left:16px;background:var(--line)}
.meow-dashboard .meow-report-toggle,.meow-dashboard .meow-report-pdf{display:inline-flex;align-items:center;gap:9px;min-height:44px;font-weight:700}
.meow-dashboard .meow-report-pdf,.meow-footer .meow-report-toggle{padding:0 17px;border:1px solid #a5602a;border-radius:999px;background:#fffaf3}
.meow-section-heading{margin:26px 4px 16px;gap:12px}
.meow-section-heading h2,.meow-footer h2{margin:0;font-size:clamp(21px,2.6vw,31px);line-height:1.25}
.meow-section-heading .meow-icon{width:34px;color:var(--brand-ink)}
.meow-order{margin-left:auto;color:var(--muted);font-size:14px}
.meow-item{border:1px solid var(--line);border-radius:12px;background:#ffffffbd;margin:4px 0;box-shadow:0 2px 5px #2438490c}
.meow-item[open]{border-color:#ead0b6;margin:12px 0;box-shadow:var(--shadow)}
.meow-hero,.meow-analysis>summary{list-style:none;cursor:pointer}
.meow-hero::-webkit-details-marker,.meow-analysis>summary::-webkit-details-marker{display:none}
.meow-hero{display:grid;grid-template-columns:46px minmax(0,260px) minmax(0,1fr) 21px;gap:14px;align-items:center;min-height:42px;box-sizing:border-box;padding:5px 20px;font-weight:700;color:var(--ink)!important}
.meow-hero .meow-hazard-icon{display:grid;place-items:center;width:46px;min-height:32px;border-radius:11px;background:var(--red-soft);color:var(--red)}
.meow-hero .meow-hazard-icon .meow-icon{width:28px}
.meow-hero .meow-title{font-size:18px;overflow-wrap:anywhere}
.meow-risk{border-left:1px solid #a7b7c4;padding-left:16px;font-size:14px;color:var(--muted);font-weight:500;overflow-wrap:anywhere}
.meow-hero>.meow-icon{grid-column:4;width:20px;color:var(--red)}
.meow-item[open]>.meow-hero{padding:12px 25px;background:#fffaf3;border-radius:12px 12px 0 0;grid-template-columns:60px minmax(0,1fr) 21px;gap:0 18px;min-height:89px}
.meow-item[open]>.meow-hero .meow-hazard-icon{grid-row:1/3;width:60px;min-height:58px;border-radius:15px}
.meow-item[open]>.meow-hero .meow-hazard-icon .meow-icon{width:37px}
.meow-item[open]>.meow-hero .meow-title{grid-column:2;font-size:22px}
.meow-item[open]>.meow-hero .meow-risk{grid-column:2;grid-row:2;border:0;padding:0;font-size:16px}
.meow-item[open]>.meow-hero>.meow-icon{grid-column:3;grid-row:1/3;transform:rotate(180deg)}
.meow-item:not([open])>.meow-panel{display:none}
.meow-panel{display:grid;grid-template-columns:minmax(0,34%) minmax(0,1fr);gap:17px;padding:18px 20px;border-top:1px solid var(--line)}
.meow-panel.solo{grid-template-columns:minmax(0,1fr)}
.meow-instructions{display:grid;align-content:start;gap:10px;min-width:0}
.meow-action{padding:17px 24px 20px;border-radius:14px;background:var(--green-soft);color:var(--green)}
.meow-action h3{margin:0 0 17px;font-size:clamp(22px,2.8vw,32px);display:flex;align-items:center;gap:9px}
.meow-action h3 .meow-icon{width:1.1em}
.meow-action ol{list-style:none;margin:0;padding:0;counter-reset:meow-action;display:grid;gap:19px}
.meow-action li{counter-increment:meow-action;display:flex;gap:11px;align-items:start;color:var(--ink);font-size:clamp(17px,2.08vw,24px);line-height:1.48;font-weight:700;overflow-wrap:anywhere}
.meow-action li::before{content:counter(meow-action);width:35px;line-height:35px;text-align:center;border-radius:50%;background:var(--green);color:var(--white);font-size:18px;font-weight:700;flex:none}
.meow-analysis{background:#fbf5ea;border-radius:12px}
.meow-analysis>summary{font-weight:700;display:flex;align-items:center;gap:8px;min-height:44px;background:#fbf5ea;border-radius:12px;padding:0 16px}
.meow-analysis>summary .meow-icon{width:17px}
.meow-analysis[open]>summary .meow-icon:last-child{transform:rotate(180deg)}
.meow-analysis-body{padding:0 16px 12px}
.meow-analysis-body p+p{margin-top:8px}
.meow-evidence-grid{min-width:0}
.meow-compare{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}
.meow-compare figure{min-width:0;margin:0;background:none;padding:0}
.meow-compare figcaption{display:inline-block;margin:0 0 8px;padding:2px 12px;border-radius:999px;background:#f4eee5;color:var(--ink);font-size:14px;font-weight:700}
.meow-compare .meow-before figcaption,.meow-compare .meow-before-detail figcaption{background:var(--red-soft);color:var(--red)}
.meow-compare > :is(.meow-before,.meow-after) figcaption{font-size:clamp(13px,1.65vw,18px)}
.meow-compare .meow-after figcaption,.meow-compare .meow-after-detail figcaption{background:#e2f0e8;color:var(--green)}
.meow-photo{display:grid;place-items:center;aspect-ratio:16/9;container-type:size;background:#f4eee5;border-radius:9px;overflow:hidden}
.meow-item[open] .meow-evidence-image{content:var(--evidence-image)}
.meow-photo .evidence{position:relative;max-width:100%;line-height:0}
.meow-photo .meow-evidence-image{display:block;width:auto;height:auto;max-width:100%;max-height:100cqh;object-fit:contain}
.meow-dashboard .region{position:absolute;box-sizing:border-box;border:2px solid var(--red);pointer-events:none;box-shadow:0 0 0 1px white}
.meow-dashboard .estimated{border-style:dashed}
.meow-dashboard .simulated-region{border-style:dashed;border-color:var(--green)}
.meow-between{position:absolute;z-index:1;left:50%;top:calc(50% + 15px);transform:translate(-50%,-50%);display:grid;place-items:center;width:34px;aspect-ratio:1;background:#fffaf3;border-radius:50%;color:var(--brand-ink);box-shadow:0 2px 8px #16394c22;pointer-events:none}
.meow-between .meow-icon{width:19px}
.meow-closeups{margin-top:8px;padding-top:6px;border-top:1px solid var(--line)}
.meow-closeups h3{display:flex;align-items:center;gap:5px;margin:0;font-size:14px;color:var(--brand-ink)}
.meow-closeups h3 .meow-icon{width:17px}
.meow-closeups .meow-compare{margin:5px 0 0}
.meow-closeups figure{position:relative;display:grid;justify-items:center;align-content:start}
.meow-closeups .meow-photo{max-width:100%}
.meow-closeups figcaption{margin:0 0 6px;font-size:12px;padding:1px 7px}
.meow-closeups .meow-photo{aspect-ratio:auto;container-type:normal;overflow:visible;background:transparent}
.meow-closeups .meow-evidence-image{max-height:clamp(116px,13.5vw,168px);border-radius:9px}
.meow-closeups a{display:block}
.meow-closeups .meow-between{top:calc(50% + 12px);width:25px;background:var(--mint-soft)}
.meow-footer{position:relative;isolation:isolate;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:22px;min-height:148px;box-sizing:border-box;padding:20px 25px;border:1px solid white;border-radius:var(--radius);background:linear-gradient(#fffaf3,#fbf5ea);box-shadow:var(--shadow)}
.meow-footer .meow-icon-tile{width:59px;border-radius:15px}
.meow-footer .meow-icon-tile .meow-icon{width:34px}
.meow-footer p{margin-top:5px;color:var(--muted)}
.meow-footer-art{position:absolute;z-index:-1;inset:0 17% 0 46%;background:url('/home/safety-report/documents.webp') center/contain no-repeat;filter:sepia(.75) saturate(.55);mask-image:radial-gradient(ellipse closest-side,#000 74%,transparent 100%)}
.meow-footer .meow-report-toggle{white-space:nowrap}
.meow-report-toggle,.meow-report-pdf{color:#6b3b20}
@media(max-width:900px){.meow-dashboard{padding-inline:22px}.meow-hero{grid-template-columns:46px minmax(0,210px) minmax(0,1fr) 21px}.meow-panel{gap:15px;padding-inline:18px}.meow-footer-art{opacity:.55;inset-inline:48% 14%}}
@media(max-width:650px){
 .meow-dashboard{padding:0 12px 20px}.meow-banner{min-height:205px;padding:18px 13px 12px}.meow-banner-heading,.meow-footer-copy{gap:9px}.meow-banner .meow-icon-tile{width:47px;border-radius:13px}.meow-banner .meow-icon-tile .meow-icon{width:31px}
 .meow-hero-art::after{width:78%;background-size:cover;mask-image:linear-gradient(90deg,transparent 15%,#0008 72%,#000a)}
 .meow-banner-actions{gap:10px}.meow-banner-actions .meow-report-toggle::after{display:none}.meow-banner .meow-improvement-total{padding-inline:9px}
 .meow-section-heading{margin:20px 1px 8px;gap:6px}.meow-section-heading .meow-icon{width:25px}.meow-order{font-size:12px}
 .meow-item>.meow-hero,.meow-item[open]>.meow-hero{grid-template-columns:36px minmax(0,1fr) 20px;gap:1px 9px;padding:8px 10px}
 .meow-item>.meow-hero .meow-hazard-icon,.meow-item[open]>.meow-hero .meow-hazard-icon{grid-row:1/3;width:36px;min-height:36px;border-radius:8px}
 .meow-item>.meow-hero .meow-hazard-icon .meow-icon,.meow-item[open]>.meow-hero .meow-hazard-icon .meow-icon{width:23px}
 .meow-item>.meow-hero .meow-title,.meow-item[open]>.meow-hero .meow-title{font-size:17px;grid-column:2}
 .meow-item>.meow-hero .meow-risk,.meow-item[open]>.meow-hero .meow-risk{grid-column:2;grid-row:2;border:0;padding:0;font-size:13px}
 .meow-item>.meow-hero>.meow-icon{grid-column:3;grid-row:1/3}
 .meow-panel{grid-template-columns:minmax(0,1fr);gap:14px;padding:9px 11px 13px}.meow-instructions{gap:8px}.meow-action{padding:13px 14px 15px}.meow-action li{font-size:17px}.meow-action ol{gap:12px}.meow-action li::before{width:28px;line-height:28px;font-size:15px}
 .meow-compare{gap:8px}.meow-compare figcaption,.meow-compare > :is(.meow-before,.meow-after) figcaption{font-size:11px;padding:2px 5px}.meow-between{width:22px}.meow-between .meow-icon{width:14px}
 .meow-footer{flex-wrap:wrap;padding:14px;min-height:133px}.meow-footer-art{display:none}.meow-footer .meow-icon-tile{width:43px}.meow-footer .meow-icon-tile .meow-icon{width:27px}
}
</style>`;
