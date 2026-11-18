import type {RiskObjectReport} from '../../domain/risk-objects.ts';
import type {VisualReport} from '../../domain/visual-report.ts';
import {topicSources} from '../../data/welfare-topics.ts';
import {BboxSchema} from '../../domain/schema.ts';
import {prepareProfessionalReport,type ProfessionalReport} from './professional-report.ts';

import {professionalStatistics} from './report-view-model.ts';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const title=(s:string)=>escape(s.split('｜')[0]);
const sec=(time:number)=>time.toFixed(2)+' 秒';
const sectionNames={PRIORITY_ACTION:'優先處理的可見風險',NEEDS_CONFIRMATION:'需要現場確認',ENRICHMENT_ADVICE:'一般環境福利與照護建議'} as const;

export function evidenceMarker(box:unknown,number:number,simulated=false){
 const parsed=BboxSchema.safeParse(box);
 if(!parsed.success)return '';
 const [x,y,r,b]=parsed.data.map(n=>n*100);
 const badgeX=x>89?Math.max(0,x-9):r<89?r:x;
 return `<svg class="evidence-marker ${simulated?'simulated':''}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="${x}" y="${y}" width="${r-x}" height="${b-y}" vector-effect="non-scaling-stroke"/></svg><span class="evidence-number ${simulated?'simulated':''}" style="left:${badgeX}%;top:${Math.min(y,85)}%">${number}</span>`;
}

export async function buildComparisonHtml(input:VisualReport,risk:RiskObjectReport,dir:string,signal?:AbortSignal){
 return renderProfessionalHtml(await prepareProfessionalReport(input,risk,dir,signal));
}

export type RoomReview={before:string;after?:string;timestamp:number;title?:string;approved?:boolean;unverified?:string[];detail?:readonly [string,string];actions:{title:string;observation:string;instruction:string;source:string;kind:string;topic_id?:string;detail?:readonly [string,string];target_object_ids?:string[];placement_conditions?:string[];region:readonly [number,number,number,number]}[]};

export type CaseVisualNote={comparisonId:string;beforeSha256:string;afterSha256:string;visibleChange:string};

export function renderProfessionalHtml(prepared:ProfessionalReport,room?:RoomReview|RoomReview[],visualNotes:readonly CaseVisualNote[]=[],web=false,externalAssets=false){
 const {visual,report,cases,overview,reviewDraft}=prepared;
 const rooms=(Array.isArray(room)?room:room?[room]:[]).filter(view=>reviewDraft||view.approved===true&&view.after);
 const issues=new Map(visual.issues.map(issue=>[issue.key,issue]));
 const covered=new Set(rooms.filter(room=>room.after).flatMap(room=>room.actions.flatMap(action=>action.target_object_ids??[])));
 const visualCandidates=cases.filter(c=>(c.summary.disposition==='illustrated'||(reviewDraft&&c.summary.disposition==='quality_review_required'))&&c.topic&&c.observation&&c.before&&c.after&&c.detail);
 const topicSeen=new Set<string|null>();
 const illustrated=rooms.length?visualCandidates.filter(item=>{
  if(item.summary.object_ids.some(id=>covered.has(id))||topicSeen.has(item.summary.topic_id))return false;
  topicSeen.add(item.summary.topic_id);return true;
 }):visualCandidates;
 const shown=new Set(illustrated.map(c=>c.summary.risk_or_welfare_finding_ids[0]));
 const caseNumbers=new Map(illustrated.map((c,index)=>[c,index+1]));
 const overviewFrames=new Map<string,typeof illustrated>();
 for(const c of illustrated){
  const frame=c.summary.evidence_frame_id;
  if(frame)overviewFrames.set(frame,[...(overviewFrames.get(frame)??[]),c]);
 }
 const roomTopics=new Set(rooms.filter(room=>room.after).flatMap(room=>room.actions.map(action=>action.topic_id)));
 const sources=[...new Set([...cases.flatMap(c=>c.summary.source_refs),...rooms.flatMap(room=>room.actions.map(action=>action.source))])].filter(url=>url.startsWith('https://'));
 const sourceNames=new Map<string,string>(Object.values(topicSources).map(s=>[s.url,s.title]));
 const sourceLink=(url:string)=>`<a href="${escape(url)}">${escape(sourceNames.get(url)??new URL(url).hostname)}</a>`;
 const image=(label:string,url:string,marker='')=>`<figure><figcaption>${label}</figcaption><div class="image-wrap"><img alt="${label}" src="${url}">${marker}</div>${web?'<details><summary>放大檢視</summary><img alt="'+label+'" src="'+url+'"></details>':''}</figure>`;
 const observation=(c:ProfessionalReport['cases'][number])=>{
  const issue=issues.get(c.summary.risk_or_welfare_finding_ids[0])!;
  return c.observation?.observation??issue.facts[0]??'';
 };
 const action=(c:ProfessionalReport['cases'][number])=>shown.has(c.summary.risk_or_welfare_finding_ids[0])
  ?report.improvement_actions.find(a=>c.summary.action_ids.includes(a.action_id))?.instruction_zh??issues.get(c.summary.risk_or_welfare_finding_ids[0])!.action
  :issues.get(c.summary.risk_or_welfare_finding_ids[0])!.action;
 const followups=visual.reading_groups.flatMap(group=>{
  const pending=group.issue_keys.filter(key=>!shown.has(key)).map(key=>cases.find(c=>c.summary.risk_or_welfare_finding_ids[0]===key)!).filter(Boolean);
  if(!pending.length)return [];
  const grouped=group.relation!=='single'&&pending.length>1&&pending.every(c=>c.summary.topic_id===pending[0].summary.topic_id);
  const entries=grouped&&pending.every(c=>issues.get(c.summary.risk_or_welfare_finding_ids[0])?.category==='ENRICHMENT_ADVICE')?[pending[0]]:pending;
  return entries.map(c=>{
   const issue=issues.get(c.summary.risk_or_welfare_finding_ids[0])!;
   const caseNote=c.summary.generation_status==='failed'?'改善示意生成失敗，請依文字建議查核。'
    :c.summary.generation_status==='review_required'?'改善示意未達出刊條件，請依文字建議查核。':'';
   const care=issue.category==='ENRICHMENT_ADVICE';
   return {category:issue.category,topic:c.summary.topic_id,html:`<li><strong>${title(care&&c.topic?c.topic.title_zh:issue.label)}</strong>${care?' · 選配照護建議':` · ${sec(issue.representative.timestamp)}`}
    ${!care&&observation(c)?`<p>${escape(observation(c))}</p>`:''}<p><b>建議</b> ${escape(action(c))}</p>
    ${!rooms.length&&caseNote&&(reviewDraft||c.summary.generation_status==='failed')?`<small>${caseNote}</small>`:''}</li>`};
  });
 });
 const checks=new Map<string,Set<string>>();
 for(const c of cases){
  const key=c.summary.risk_or_welfare_finding_ids[0], issue=issues.get(key);
  if(!issue||shown.has(key)||c.summary.object_ids.some(id=>covered.has(id)))continue;
  const care=issue.category==='ENRICHMENT_ADVICE';
  if(care&&roomTopics.has(c.summary.topic_id??undefined))continue;
  const label=c.topic?.title_zh??'其他居家查核';
  const items=checks.get(label)??new Set<string>();
  if(care&&items.size)continue;
  items.add(escape(action(c)));
  checks.set(label,items);
 }
 const placementChecks=[...new Set(rooms.flatMap(room=>[...(room.unverified??[]).map(item=>'確認'+item+'。'),...room.actions.flatMap(a=>a.placement_conditions??[])]))];
 // The visual report already contains one stable key per aggregated issue.
 // Reading groups may denote possible relationships, so they cannot merge locations.
 const {improvements,statistics}=professionalStatistics(prepared,placementChecks);
 const hazardCounts=new Map(statistics.hazards.map(h=>[h.label,h.count]));
 const illustratedByIssue=new Map<string,ProfessionalReport['cases'][number]>();
 for(const c of illustrated){
  const key=c.summary.risk_or_welfare_finding_ids[0];
  if(!illustratedByIssue.has(key))illustratedByIssue.set(key,c);
 }

 const top=improvements.slice(0,3);
 const titleFor=(c:ProfessionalReport['cases'][number])=>title(issues.get(c.summary.risk_or_welfare_finding_ids[0])!.label);
 const seenCare=new Set<string|null>();
 const categorized=followups.filter(item=>{
  if(item.category!=='ENRICHMENT_ADVICE'||item.topic===null)return true;
  if(seenCare.has(item.topic))return false;
  seenCare.add(item.topic);return true;
 });
 return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${externalAssets?"'self'":"data:"}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
 <title>貓咪居家環境健檢報告｜MeowHome</title><style>
 .report-statistics{break-inside:avoid;margin:16px 0}.report-statistics dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.report-statistics dl div{background:#edf6fb;color:#103b5b;padding:12px;border-radius:8px}.report-statistics dd{font-size:30px;font-weight:700;margin:0}.report-statistics dt{font-weight:700}.hazard-counts{padding-left:1.4em}.hazard-counts strong{color:#103b5b}
 @page{size:A4;margin:13mm 15mm;@bottom-right{content:"第 " counter(page) " 頁";color:#3f2e24;font:10px "Microsoft JhengHei",sans-serif}}
 body{font:12px/1.5 "Noto Sans CJK TC","Microsoft JhengHei",sans-serif;color:#3f2e24;margin:0;overflow-wrap:anywhere}
 h1{font-size:29px;margin:0}h2{font-size:19px;margin:15px 0 6px;break-after:avoid}h3{font-size:17px;margin:6px 0;break-after:avoid}
 header{border-bottom:3px solid #a8562a;padding-bottom:10px}.kicker{font-weight:700;letter-spacing:.06em}.notice{background:#fffaf0;padding:10px;margin:10px 0}
 p{margin:3px 0}small{color:#7a6252}a{color:#7d4517}li{margin-bottom:6px;break-inside:avoid}
 article{border-top:1px solid #efe3cf;padding-top:8px;margin:10px 0}.pair{break-inside:avoid;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin:8px 0}
 figure{margin:0;background:#fbf5ea;padding:6px}figcaption{font-weight:bold;margin-bottom:4px}
 img{display:block;max-width:100%;max-height:67mm;width:auto;height:auto;margin:auto}.detail img{max-height:62mm}
 .observations li{padding-bottom:5px;border-bottom:1px solid #efe3cf}.scope{break-inside:avoid;border-top:2px solid #a8562a;margin-top:16px}
 .sources{columns:2}.overview{break-inside:avoid}.room-frame{position:relative;display:inline-block;vertical-align:top}
 .overview figure{text-align:center}.room-frame img{max-width:120mm;max-height:78mm}.room-marker{position:absolute;box-sizing:border-box;border:2px solid #f8ca72}
 .room-marker b{display:block;width:18px;text-align:center;background:#3f2e24;color:white;border-radius:50%}
 .room-key{display:flex;flex-wrap:wrap;gap:4px 22px;margin:6px 0}.detail figure{background:#fdedc4}
 .detail img{width:100%;height:50mm;object-fit:contain}.comparison{break-inside:avoid}
 .comparison .pair:not(.detail) img{max-height:49mm}.draft{background:#fff0c4;padding:7px}
 .room-section{break-inside:auto}.room-section .detail img{height:30mm}.room-action{break-inside:avoid}
 .field-check{break-inside:avoid;margin:7px 0}.field-check ul{margin:4px 0;padding-left:1.4em}
 .overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}
 .overview-grid img{max-height:34mm}.overview-grid figcaption{font-size:11px}.overview-key{padding-left:1.7em;margin:6px 0}
 .overview-key li{margin:2px 0}.image-wrap{position:relative;display:table;margin:auto;max-width:100%}
 .evidence-marker{position:absolute;inset:0;width:100%;height:100%;fill:none;stroke:#f06b38;stroke-width:2px}
 .evidence-marker.simulated{stroke:#35d1b3;stroke-dasharray:4 3}
 .evidence-number{position:absolute;background:#8d320d;color:#fff;border:1px solid white;border-radius:4px;padding:0 4px;font-size:11px;font-weight:700}
 .evidence-number.simulated{background:#00685b}.position-note{margin:5px 0}
 @media print{.report-statistics{break-after:page}}
 .comparison{break-before:page;margin:0;padding-top:10px}.comparison .pair:not(.detail) img{max-height:57mm}
 .comparison .detail img{width:auto;height:auto;max-height:77mm;max-width:100%}.comparison .detail figure{min-height:60mm}
 .followups{break-before:page}.followups h3{margin-top:12px}.care-section{break-inside:avoid}
 .comparison{font-size:13px}.comparison h2{font-size:22px}.change{padding:7px 9px;background:#fffaf0;margin:8px 0}

 ${web?`@media screen{
 :root{--paper:#fbf5ea;--cream:#fffaf0;--ink:#3f2e24;--link:#7d4517}
 html{background:var(--paper)}body{max-width:1040px;margin:auto;padding:clamp(16px,4vw,48px);font-size:16px;color:var(--ink)}
 h1{font-size:clamp(28px,5vw,44px)}h2{font-size:24px}header,.notice,article,.scope{background:var(--cream);padding:clamp(14px,3vw,28px)}
 article{margin:24px 0;scroll-margin-top:12px}.comparison{font-size:16px}.pair,.overview-grid{gap:12px}
 img,.comparison .pair:not(.detail) img,.comparison .detail img,.overview-grid img{max-height:none}
 .comparison .detail figure{min-height:0}summary,.overview-key a,.back-link{display:list-item;min-height:44px;box-sizing:border-box;padding:10px 0;color:var(--link);cursor:pointer}
 .overview-key a,.back-link{display:inline-flex;align-items:center}.image-wrap{width:fit-content}details img{width:100%}
 figure:has(details[open]){grid-column:1/-1}figure:has(details[open])>.image-wrap{display:none}
 .sources{columns:1}a:focus-visible,summary:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
 }@media screen and (max-width:560px){.overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pair{gap:6px}figure{min-width:0}figcaption{font-size:14px}}` : ''}
 </style><body><header><p class="kicker">MeowHome｜AI 居家環境安全檢測</p><h1>貓咪居家環境健檢報告</h1><p>專業圖文報告 · ${escape(new Date(visual.generated_at).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'}))} · 報告編號 ${escape(visual.report_id.slice(0,8))}</p></header>
 ${reviewDraft?'<p class="draft"><b>私人影像審閱稿</b> · 可能包含待審模擬，請勿對外分享。</p>':''}
 <section class="report-statistics"><h2>居家環境安全檢測結果總覽</h2>
 ${report.source!=='azure'?'<p>離線測試｜合成分析與測試圖片</p>':''}
 ${visual.status==='incomplete'?'<p>本次分析僅部分完成。</p>':''}
 <dl>${[[improvements.length,'需要改善'],[statistics.confirmations,'需要現場確認'],[hazardCounts.size,'已分類危害類型'],[statistics.evidence_frames,'原始證據影格']].map(([n,label])=>`<div><dt>${label}</dt><dd>${n}</dd></div>`).join('')}</dl>
 ${hazardCounts.size?`<h3>主要危害類型</h3><ul class="hazard-counts">${[...hazardCounts].sort((a,b)=>b[1]-a[1]).map(([label,count])=>`<li>${escape(label)} <strong>${count} 項</strong></li>`).join('')}</ul>`:''}
 ${top.length?`<h3>優先採取的行動</h3><ol>${top.map(i=>`<li><strong>${title(i.label)}</strong><p>${escape(i.action)}</p></li>`).join('')}</ol>`:'<p>這次抽樣未整理出優先改善項目，可參考後續查核。</p>'}
 </section>
 ${web?`<ol id="report-improvements" hidden>${improvements.map(i=>{
  const c=illustratedByIssue.get(i.key);
  return `<li data-label="${title(i.label)}" data-action="${escape(i.action)}" data-observation="${escape(i.facts[0]??'')}" data-impact="${escape(i.inferences[0]??'')}" data-uncertainty="${escape(i.uncertainty[0]??'')}"${c?` data-case="case-${caseNumbers.get(c)}"`:''}></li>`;
 }).join('')}</ol>`:''}
 ${rooms.length?'<h2>02｜多視角改善提案</h2>':''}
 ${rooms.map(room=>`<section class="room-section"><h3>${escape(room.title??'同視角改善提案')}｜${sec(room.timestamp)}</h3>
 <div class="pair"><figure><figcaption>改善前｜原始影格</figcaption><div class="room-frame"><img style="max-width:100%" alt="原始影格" src="${room.before}">
 ${room.actions.map(({region:[x,y,r,b]},i)=>`<span class="room-marker" style="left:${x*100}%;top:${y*100}%;width:${(r-x)*100}%;height:${(b-y)*100}%"><b>${i+1}</b></span>`).join('')}</div></figure>
 ${room.after?image(room.approved?'改善後｜AI 模擬改善示意':'改善後｜待審閱 AI 模擬改善示意',room.after):'<figure><figcaption>改善後｜尚無可審閱影像</figcaption><p>此處列出原始畫面與擬議變更。</p></figure>'}</div>
 ${room.detail&&!room.actions.some(action=>action.detail)?`<div class="pair detail">${image('改善前局部',room.detail[0])}${image('改善後局部｜AI 模擬',room.detail[1])}</div>`: ''}
 <ol>${room.actions.map(a=>`<li class="room-action"><b>${escape(a.title)}</b> · ${a.kind==='optional_welfare_enrichment'?'選配環境豐富化':'預防性整理'}<p>${escape(a.observation)}</p><p>${escape(a.instruction)} · ${sourceLink(a.source)}</p>
 ${a.detail?`<div class="pair detail">${image('改善前局部',a.detail[0])}${image('改善後局部｜AI 模擬',a.detail[1])}</div>`:''}</li>`).join('')}</ol>
 <small>範圍限此視角，標註為人工指定的提案區域。</small></section>`).join('')}
 ${!rooms.length&&overviewFrames.size?`<section class="overview" id="evidence-overview"><h3>影片多影格｜改善位置總覽</h3>
 <div class="overview-grid">${[...overviewFrames.values()].map(group=>image(sec(group[0].summary.evidence_timestamp!),group[0].before!,group.map(c=>evidenceMarker(c.summary.before_region?.bbox,caseNumbers.get(c)!)).join(''))).join('')}</div>
 <ol class="overview-key">${illustrated.map(c=>`<li><a href="#case-${caseNumbers.get(c)}">${titleFor(c)} · ${sec(c.summary.evidence_timestamp!)} · 查看案例 ${caseNumbers.get(c)}</a></li>`).join('')}</ol>
 <small>原始採樣畫面 · 框線來源與對位限制見各案例。</small></section>`
 :!rooms.length&&overview?`<section class="overview"><h3>代表畫面｜改善位置總覽</h3>
 <figure><div class="room-frame"><img alt="原始採樣影格" src="${overview.image}">
 ${overview.markers.map(({bbox:[x,y,r,b]},i)=>`<span class="room-marker" style="left:${x*100}%;top:${y*100}%;width:${(r-x)*100}%;height:${(b-y)*100}%"><b>${i+1}</b></span>`).join('')}</div></figure>
 <ol class="room-key">${overview.markers.map(m=>`<li>${m.labels.map(title).join('、')}</li>`).join('')}</ol>
 <small>${sec(overview.timestamp)} · 框線為定位參考。${illustrated.length?'局部模擬見下一節。':''}</small></section>`:''}
 ${illustrated.length?'':`<h2>${rooms.length?'03':'02'}｜圖文改善案例</h2>`}
 ${illustrated.length?illustrated.map(c=>{
  const topic=c.topic!, change=report.improvement_actions.find(a=>c.summary.action_ids.includes(a.action_id))?.expected_visual_change;
  const caseSources=c.summary.source_refs.filter(url=>url.startsWith('https://'));
  const number=caseNumbers.get(c)!,issue=issues.get(c.summary.risk_or_welfare_finding_ids[0])!;
  const note=visualNotes.find(n=>n.comparisonId===c.summary.comparison_id&&n.beforeSha256===c.summary.evidence_frame_sha256&&n.afterSha256===c.summary.generation_metadata?.output_sha256);
  const beforeMarker=evidenceMarker(c.summary.before_region?.bbox,number);
  const afterMarker=evidenceMarker(c.summary.after_region?.bbox,number,true);
  return `<article class="comparison" id="case-${number}"><p class="kicker">圖文改善案例 ${number} · ${escape(topic.title_zh)} · ${sec(c.summary.evidence_timestamp!)}</p><h2>${titleFor(c)}${topic.topic_kind==='welfare_enrichment'?' · 可選環境改善':''}</h2>
   <p><b>直接觀察</b> ${escape(observation(c))}</p>
   <div class="pair">${image('改善前｜原始影格',c.before!,beforeMarker)}${image('改善後｜AI 模擬示意',c.after!,afterMarker)}</div>
   <p class="position-note"><small>${beforeMarker?(c.summary.before_region?.source==='user_confirmed'?'Before 實線為人工確認位置。':'Before 實線為 AI 估計範圍。'):'Before 位置待確認。'} ${afterMarker?'After 虛線為場景對位區域。':'After 位置待確認，請看下方局部對照。'}</small></p>
   <div class="pair detail">${image('改善前局部｜原圖',c.detail![0])}${image('改善後局部｜AI 模擬示意',c.detail![1])}</div>
   ${note?`<p class="change"><b>畫面可見差異</b> ${escape(note.visibleChange)}</p>`:''}
   <p><b>實際改善</b> ${escape(action(c))}</p>
   ${issue.inferences[0]?`<p><b>可能影響</b> ${escape(issue.inferences[0])}</p>`:''}
   ${issue.uncertainty[0]?`<p><b>待現場確認</b> ${escape(issue.uncertainty[0])}</p>`:''}
   <p><small>改善後圖片為 AI 改善示意，實際改善須在現場確認。</small></p>
   ${c.summary.disposition==='quality_review_required'?'<p class="draft">待審閱｜AI 模擬改善示意</p>':''}${!note&&change&&/[\u3400-\u9fff]/.test(change)?`<p><b>模擬目標</b> ${escape(change)}</p>`:''}
   <p><small>${caseSources.map(sourceLink).join(' · ')}</small></p>
   ${web&&!rooms.length?'<a class="back-link" href="#evidence-overview">返回影格總覽</a>':''}
  </article>`;
 }).join(''):'<p>目前沒有通過影像審閱且具完整四圖的案例。可先參考下列查核與改善建議。</p>'}
 <section class="${illustrated.length?'followups':''}"><h2>${rooms.length?'04｜現場查核':'03｜後續查核與照護建議'}</h2>
 ${rooms.length?`<p>依實際使用情形核對下列條件。畫面未涵蓋的照護資源也可一併確認。</p>
 ${placementChecks.length?`<section class="field-check"><b>模擬提案的擺放條件</b><ul>${placementChecks.map(item=>`<li>${escape(item)}</li>`).join('')}</ul></section>`:''}
 ${[...checks].map(([label,items])=>`<section class="field-check"><b>${escape(label)}</b><ul>${[...items].map(item=>`<li>${item}</li>`).join('')}</ul></section>`).join('')}`
 :categorized.length?Object.entries(sectionNames).map(([category,label])=>{
  const entries=categorized.filter(item=>item.category===category);
  return entries.length?`<div class="${category==='ENRICHMENT_ADVICE'?'care-section':''}"><h3>${label}</h3><ul class="observations">${entries.map(item=>item.html).join('')}</ul></div>`:'';
 }).join(''):'<p>這次抽樣沒有其他可列出的發現。</p>'}</section>
 <div class="scope"><h2>${rooms.length?'05':'04'}｜依據與評估範圍</h2>
 ${sources.length?`<ul class="sources">${sources.map(url=>`<li>${sourceLink(url)}</li>`).join('')}</ul>`:''}
 ${visual.limitations.includes('部分影格細節不足，結果僅限可見資訊。')?'<p>部分影格細節不足，結果僅限可見資訊。</p>':''}
 <p>${visual.media_type==='video'?`影片 ${visual.analysis_metadata.duration_seconds?.toFixed(1)??'未知'} 秒 · ${visual.analysis_metadata.sampled_times.length} 個抽樣時間點`:'居家照片 · 單張取樣'}</p>
 <p>評估僅涵蓋取樣畫面。畫面未見的物件或資源仍可能存在，品種、結構承重與安裝可靠度須另行確認。</p>
 <p>改善後圖片為 AI 模擬改善示意，並非實際改善完成的證據。本報告供照護教育與居家準備使用，不能作為診斷或安全認證。</p>
 <p>圖文報告與完整影格限授權對象於工作期限內檢視。對外分享與長期保存依 Meowho 影像政策辦理。</p></div>
 ${web?`<footer><a class="back-link" href="${externalAssets?'./pdf?download=1':'./before-after.pdf'}" download>下載完整 PDF 報告</a></footer>`:''}</body></html>`;
}
