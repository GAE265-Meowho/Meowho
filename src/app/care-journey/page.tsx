"use client";
import { useMemo, useState } from "react";
import { addCommitment, bringBackPreparation, cats, initialState, moveToStage, place, stages, unmet, type CatId, type JourneyState, type Stage } from "@/lib/care-journey/engine";
import "./care-journey.css";
const itemName: Record<string,string>={box:"原休息箱",mat:"原墊",lowLitter:"低入口盆",carrier:"外出籠",litter:"一般入口盆"};
function pickStageAction(state:JourneyState):JourneyState {
 const lesson={kitten:"預定週四 19:00 再進行短次外出籠熟悉；反應未知",adult:"週五 19:00 朋友可到場，但個體任務與進入方式仍待確認",mature:"下次使用同一量具記錄補水量與剩餘量，週六回顧；不能推論喝水量",senior:"重新檢視地面資源及交接清單，必要時詢問專業人士"}[state.stage];
 const source=state.scope==="future"?"future":state.scope==="teaching"?"teaching":"current";
 return addCommitment(state,{id:state.stage+"-"+state.cat.id,label:lesson,source,status:"pending"});
}
export default function JourneyPage(){
 const [id,setId]=useState<CatId>("xiaohe");const [current,setCurrent]=useState<JourneyState>(()=>initialState("xiaohe"));const [view,setView]=useState<JourneyState>(()=>initialState("xiaohe"));
 const [notice,setNotice]=useState("選擇貓咪後，從交接資料開始認識牠。");
 const [entry,setEntry]=useState(""); const [showPlan,setShowPlan]=useState(false);
 const issues=useMemo(()=>unmet(view),[view]);
 const switchCat=(next:CatId)=>{const s=initialState(next);setId(next);setCurrent(s);setView(s);setShowPlan(false);setNotice("已重設家庭、用品及支援狀態，僅切換貓咪資料。");};
 const update=(fn:(s:JourneyState)=>JourneyState)=>{setView(x=>{const next=fn(x);if(x.scope==="current")setCurrent(next);return next;});};
 const switchStage=(s:Stage)=>{const v=moveToStage(current,s);setView(v);setNotice(v.scope==="teaching"?"已切換獨立幼貓教學，不會改寫原貓咪的歷史。":v.scope==="future"?"進入假設預演，不代表貓咪未來一定發生這些事。":"回到目前生活。");};
 const home=()=>{setView(current);setNotice("回到原貓咪目前生活；假設配置不會自動帶回。");};
 const bringBack=()=>{const next=bringBackPreparation(current,view);setCurrent(next);setView(next);setNotice("已將未來演練中的準備待辦帶回目前計畫，狀態仍為待確認。");};
 const handleSuggestion=()=>{if(!entry.trim())return;setNotice("已記下你的提案：「"+entry.slice(0,100)+"」。本版本沒有接入 LLM；自由文字不會被視為已確認安排，請使用下方結構化操作。");setEntry("");};
 return <main className="cj-shell">
 <header className="cj-top"><a href="/" className="cj-back">← 回喵戶首頁</a><span>Meowho 喵戶 / AI Care Journey 2.0</span><span className="cj-demo">虛構教學原型 · 不連結真實領養</span></header>
 <section className="cj-hero"><span className="cj-eyebrow">從相遇到長久照顧</span><h1>先想像一起生活，<br/>再練習面對改變。</h1><p>選一隻貓，走進共同生活的房間。認識牠的已知需求，安排生活，也看看往後可能需要準備什麼。</p></section>
 <div className="cj-layout"><section className="cj-maincol">
 <div className="cj-card"><div className="cj-section-head"><h2>01 · 今天，你想認識誰？</h2><span>同一家庭 · 兩貓對照</span></div>
 <div className="cj-cats">{(["xiaohe","ali"] as CatId[]).map(cid=><button key={cid} className={"cj-cat "+(id===cid?"selected":"")} onClick={()=>switchCat(cid)}><span className="cj-cat-avatar">{cid==="xiaohe"?"🐈":"🐈‍⬛"}</span><b>{cats[cid].name}</b><small>虛構 · 4 歲成貓</small></button>)}</div>
 <div className="cj-known"><b>交接資料｜{current.cat.name}</b><p>{current.cat.known}</p><small>依據：{current.cat.source}</small><p className="cj-unknown">仍未知：{current.cat.unknown}</p></div>
 </div>
 <div className="cj-card"><div className="cj-section-head"><h2>02 · 我們的共同生活空間</h2><span>可操作 2.5D 示意</span></div>
 <p className="cj-muted">這是簡化的平面房間，不是居家安全認證。點選用品即可完成示範配置。</p>
 <div className="cj-room"><div className="cj-window">☀ 窗邊</div><div className="cj-room-sofa">沙發</div><div className="cj-room-desk">工作桌</div><div className="cj-pet"><span>🐈</span><small>{view.cat.name}</small></div><div className="cj-room-carpet">地面休息區</div><div className="cj-room-food">食水</div><div className="cj-room-litter">{view.placements.lowLitter==="accessible"?"低入口盆":"一般入口盆"}</div>{view.placements.box==="accessible"&&<div className="cj-room-box">原箱＋墊</div>}{view.placements.carrier==="accessible"&&<div className="cj-room-carrier">外出籠</div>}</div>
 <div className="cj-actions">{(view.cat.id==="xiaohe"?["box","mat"]:["ali","songsong"].includes(view.cat.id)?["lowLitter"]:view.stage==="kitten"?["carrier"]:[]).map(item=><button className="cj-button" key={item} onClick={()=>update(s=>place(s,item as "box"|"mat"|"lowLitter"|"carrier"))}>配置{itemName[item]}</button>)}</div>
 <div className={"cj-note "+(issues.length?"cj-warning":"cj-success")}><b>{issues.length?"目前待處理":"個體用品配置已符合示範要求"}</b><p>{issues.length?issues.join("；"):"仍需實際觀察新家的使用情況；本圖不代表動物已適應。"}</p></div>
 </div>
 <div className="cj-card"><div className="cj-section-head"><h2>03 · 生活進入不同階段</h2><span>每個階段都能採取行動</span></div>
 <div className="cj-stages">{stages.map(s=><button onClick={()=>switchStage(s.id)} key={s.id} className={"cj-stage "+(view.stage===s.id?"selected":"")}><b>{s.title}</b><small>{s.id==="kitten"?"獨立教學":s.id==="adult"?"目前生活":"未來假設"}</small></button>)}</div>
 <div className="cj-scene"><div className="cj-scene-title"><span>◆</span> {stages.find(s=>s.id===view.stage)?.title}篇 · {view.scope==="future"?"假設的未來":view.scope==="teaching"?"其他貓咪的獨立教學":"目前生活"}</div><p>{stages.find(s=>s.id===view.stage)?.lesson}</p>
 {view.stage==="mature"&&<div className="cj-record">週一：補水 1 杯（容量未知）<br/>週二：補水 120 mL<br/><b>這兩項都不能直接代表實際喝水量。</b></div>}
 {view.stage==="adult"&&<div className="cj-record">朋友：「我週五 19:00 可以到。」<br/>但尚未接受具體任務和進入方式，不能當作已確認承接。</div>}
 <button className="cj-button cj-mint" onClick={()=>update(pickStageAction)}>{stages.find(s=>s.id===view.stage)?.action}</button>
 {view.scope==="future"&&<button className="cj-button cj-outline" onClick={bringBack}>將未來準備待辦帶回目前計畫</button>}
 {view.scope!=="current"&&<button className="cj-button cj-outline" onClick={home}>返回目前生活</button>}
 </div></div>
 </section>
 <aside className="cj-side"><div className="cj-card cj-sticky"><h2>我的照護準備計畫</h2><div className="cj-scope">{view.scope==="current"?"目前生活":view.scope==="future"?"未來假設（不改寫現在）":"獨立教學（不寫入原貓）"}</div><p className="cj-muted">只呈現玩家已安排的練習和仍待確認事項，不是領養資格評分。</p>
 {view.commitments.length===0?<p className="cj-empty">尚無安排。先從房間與階段任務開始。</p>:<ul className="cj-plan">{view.commitments.map(c=><li key={c.id}><b>{c.label}</b><span>{c.status==="pending"?"待確認":"已確認"} · {c.source==="future"?"未來準備":c.source==="teaching"?"獨立教學":"目前安排"}</span></li>)}</ul>}
 <label className="cj-label" htmlFor="proposal">自由提出你的解決方式（示意入口）</label><textarea id="proposal" value={entry} onChange={e=>setEntry(e.target.value)} placeholder="例如：週五我先請朋友幫忙，之後再確認另一位備援…" rows={3}/><button onClick={handleSuggestion} className="cj-button cj-outline">記下方案（尚未接入 AI）</button>
 <button className="cj-button cj-mint cj-wide" onClick={()=>setShowPlan(!showPlan)}>{showPlan?"收起摘要":"查看照護計畫摘要"}</button>
 {showPlan&&<div className="cj-summary"><strong>目前需要確認</strong><p>{unmet(current).join("；")||"用品配置已完成示範核對。"}</p><strong>下一步</strong><p>核實照護者同意、實際作息與完整飼養預算，並依真實照護專業資訊調整。</p></div>}
 <p className="cj-feedback" role="status">{notice}</p><button onClick={()=>switchCat(id)} className="cj-reset">重新開始此貓咪的示範</button>
 </div></aside></div><footer className="cj-footer">本頁全部貓咪與資料皆為虛構教學素材（is_demo: true）。目前為可操作原型，沒有真實 AI、3D、動物行為預測或領養資格判斷。</footer></main>;
}
