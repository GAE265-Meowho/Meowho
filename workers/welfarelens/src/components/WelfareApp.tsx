"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { CandidateSchema } from '../domain/schema';
import type { Candidate } from '../domain/schema';
import { buildScanResult, buildScanEdits } from '../domain/scan-result';
import { ImageResultSchema } from '../domain/image-result';
import type { ImageResult } from '../domain/image-result';
import type { PhotoPoint } from '../domain/photo-location';
import { compareAssessments } from '../domain/assessment';
import { simulatePlan } from '../domain/improvement-plan';
import { PHOTO_DEMO } from '../data/photo-demo';
import ImageComparison from './ImageComparison';
import {ScanRoomPhoto} from './RoomPhoto';
import {cropRegion,needsPlantRefinement} from '../domain/plant-refinement';
import {refinePlants} from '../domain/refinement-workflow';
import type {RefinementReport} from '../domain/refinement-workflow';
type ScanRecord = {
    candidate: Candidate;
    processingMs: number;
    requestMs: number;
    timings?: Record<string, number>;
    refinements?: RefinementReport[];
    calls?:number;
};
export default function WelfareApp() {
    const [photo, setPhoto] = useState(''), [record, setRecord] = useState<ScanRecord | null>(null), [phase, setPhase] = useState(''), [error, setError] = useState('');
    const [imageResult, setImageResult] = useState<ImageResult | null>(null), [imageBusy, setImageBusy] = useState(false), [imageError, setImageError] = useState('');
    const [active,setActive]=useState<string|null>(null);
    const [demo, setDemo] = useState(false);
    const [positions, setPositions] = useState<Record<string, PhotoPoint>>({});
    const [editing, setEditing] = useState<string | null>(null);
    const [simulated, setSimulated] = useState<number[]>([]);
    const originalRef=useRef<HTMLImageElement|null>(null),fingerprintRef=useRef('');
    const revision = useRef(0), uploadRevision = useRef(0), abortRef = useRef<AbortController | null>(null), editRef = useRef<AbortController | null>(null), cache = useRef<{
        photo: string;
        record: ScanRecord;
    } | null>(null);
    const scan = useMemo(() => record ? buildScanResult(record.candidate) : null, [record]);
    const targets = useMemo(() => record ? buildScanEdits(record.candidate) : [], [record]);
    const evidence = useMemo(() => ({ version: 1 as const, capture_id: 'current-scan', mode: 'OBSERVED' as const, cases: record?.candidate.assessments ?? [] }), [record]);
    function clearRequests() { abortRef.current?.abort(); editRef.current?.abort(); abortRef.current = null; editRef.current = null; setImageBusy(false); }
    useEffect(() => () => { abortRef.current?.abort(); editRef.current?.abort(); uploadRevision.current++; }, []);
    function replace() { clearRequests(); revision.current++; setRecord(null); setDemo(false); setActive(null); setPositions({}); setEditing(null); setSimulated([]); setImageResult(null); setImageError(''); setError(''); }
    async function analyze(src: string, processingMs: number, force = false) {
        if (force) replace();
        abortRef.current?.abort();
        const token = ++revision.current, abort = new AbortController();
        abortRef.current = abort;
        setRecord(null);
        setError('');
        setImageResult(null);
        setImageError('');
        const cacheKey=src+fingerprintRef.current;
        if (!force && cache.current?.photo === cacheKey) {
            setRecord(cache.current.record);
            setPhase('');
            abortRef.current = null;
            return;
        }
        setPhase('AI 正在分析物件、空間關係與居家照護風險…');
        const started = performance.now();
        try {
            const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, imageDataUrl: src }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(125000)]) });
            const data = await response.json();
            if (!response.ok)
                throw Error(data.error || '分析未完成，請重試。');
            let candidate = CandidateSchema.parse(data.candidate);
            if(token!==revision.current||abort.signal.aborted)return;
            const original=originalRef.current;
            let refinements:RefinementReport[]=[],calls=1;
            const refinementStarted=performance.now();
            if(original&&needsPlantRefinement(candidate).length){
                setRecord({candidate,processingMs,requestMs:performance.now()-started,timings:data.timings});
                setPhase('正在自動放大植物細節辨識；以下為初步分析…');
                const scene=candidate;
                const refined=await refinePlants(scene,async index=>{
                    abort.signal.throwIfAborted();
                    const box=cropRegion(scene.objects[index].bbox,original.naturalWidth,original.naturalHeight);
                    if(!box)throw Error('No location');
                    const canvas=document.createElement('canvas'),scale=Math.min(1,1536/Math.max(box.width,box.height));
                    canvas.width=Math.max(1,Math.round(box.width*scale));canvas.height=Math.max(1,Math.round(box.height*scale));
                    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Crop unavailable');
                    ctx.drawImage(original,box.x,box.y,box.width,box.height,0,0,canvas.width,canvas.height);
                    let crop=canvas.toDataURL('image/jpeg',.92);if(crop.length>1600000)crop=canvas.toDataURL('image/jpeg',.82);if(crop.length>1600000)throw Error('Crop too large');
                    calls++;
                    const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,imageDataUrl:crop,refinement:'plant'}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(125000)])});
                    const detail=await r.json();if(!r.ok)throw Error('Refinement unavailable');return CandidateSchema.parse(detail.candidate);
                },abort.signal,partial=>{if(token===revision.current&&!abort.signal.aborted)setRecord({candidate:partial,processingMs,requestMs:performance.now()-started,timings:data.timings});});
                candidate=refined.candidate;refinements=refined.reports;
            }
            const refinementMs=performance.now()-refinementStarted;
            const requestMs = performance.now() - started;
            const next = { candidate, processingMs, requestMs, timings: data.timings,refinements,calls };
            performance.clearMeasures('welfarelens.plantRefinement');performance.measure('welfarelens.plantRefinement',{start:0,duration:refinementMs});
            performance.clearMeasures('welfarelens.imageProcessing');
            performance.measure('welfarelens.imageProcessing', { start: 0, duration: processingMs });
            performance.clearMeasures('welfarelens.analysisTotal');
            performance.measure('welfarelens.analysisTotal', { start: 0, duration: requestMs + processingMs });
            for (const key of ['vlmMs', 'toxicityLookupMs', 'serverTotalMs'])
                if (Number.isFinite(data.timings?.[key])) {
                    performance.clearMeasures('welfarelens.' + key);
                    performance.measure('welfarelens.' + key, { start: 0, duration: data.timings[key] });
                }
            if (token === revision.current && !abort.signal.aborted) {
                cache.current = refinements.some(r=>r.status==='failed')?null:{ photo: cacheKey, record: next };
                setRecord(next);
            }
        }
        catch (e) {
            if (token === revision.current && !abort.signal.aborted)
                setError(e instanceof Error && e.name !== 'ZodError' ? e.name === 'TimeoutError' ? '分析逾時，請重試或重新拍攝。' : e.message : '未取得有效分析結果，請重試或重新拍攝。');
        }
        finally {
            if (abortRef.current === abort) {
                abortRef.current = null;
                setPhase('');
            }
        }
    }
    function loadDemo() {
        uploadRevision.current++;
        replace();
        originalRef.current = null;
        setPhase('');
        setDemo(true);
        setPhoto('/demo-room.svg');
        setRecord({candidate: PHOTO_DEMO, processingMs: 0, requestMs: 0});
    }
    async function loadFile(file: File | undefined) {
        if (!file)
            return;
        const token = ++uploadRevision.current, started = performance.now();
        replace();
        originalRef.current=null;
        fingerprintRef.current='';
        setPhoto('');
        setPhase('正在準備照片…');
        const url = URL.createObjectURL(file);
        try {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15000000)
                throw Error('請選擇 15 MB 以下的 JPEG、PNG 或 WebP 照片。');
            const image = new Image();
            image.src = url;
            try {
                await image.decode();
            }
            catch {
                throw Error('照片讀取失敗，請重新拍攝或選擇照片。');
            }
            if (image.naturalWidth * image.naturalHeight > 50000000)
                throw Error('照片解析度過大，請使用一般拍照模式。');
            const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d');
            if (!context)
                throw Error('瀏覽器無法處理照片。');
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            let src = canvas.toDataURL('image/jpeg', .82);
            if (src.length > 1600000)
                src = canvas.toDataURL('image/jpeg', .65);
            if (src.length > 1600000)
                throw Error('照片資料仍過大，請選擇較小照片。');
            if (token !== uploadRevision.current)
                return;
            const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
            if(token!==uploadRevision.current)return;
            fingerprintRef.current=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
            originalRef.current=image;
            setPhoto(src);
            await analyze(src, performance.now() - started);
        }
        catch (e) {
            if (token === uploadRevision.current) {
                setError(e instanceof Error ? e.message : '照片處理失敗。');
                setPhase('');
            }
        }
        finally {
            URL.revokeObjectURL(url);
        }
    }
    function cancelImage() { editRef.current?.abort(); editRef.current = null; setImageBusy(false); setImageError('已取消等待。服務可能仍在處理，取消不保證停止計費。'); }
    async function generateImage() {
        if (abortRef.current || editRef.current || !record || !targets.length)
            return;
        const token = revision.current, abort = new AbortController();
        editRef.current = abort;
        setImageBusy(true);
        setImageError('');
        try {
            const source = new Image();
            source.src = photo;
            await source.decode();
            if (abort.signal.aborted || token !== revision.current)
                return;
            const response = await fetch('/api/improve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, imageDataUrl: photo, evidence, objects: record.candidate.objects, candidate: record.candidate, width: source.naturalWidth, height: source.naturalHeight }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(185000)]) });
            const data = await response.json();
            if (!response.ok)
                throw Error(data.error || '改善圖片未完成，請重試。');
            const result = ImageResultSchema.parse(data), img = new Image();
            img.src = result.imageDataUrl;
            await img.decode();
            if (img.naturalWidth !== result.width || img.naturalHeight !== result.height)
                throw Error('圖片尺寸驗證失敗。');
            if (token === revision.current && !abort.signal.aborted)
                setImageResult(result);
        }
        catch (e) {
            if (token === revision.current && !abort.signal.aborted)
                setImageError(e instanceof Error && e.name !== 'ZodError' ? e.message : '未取得有效改善圖片。');
        }
        finally {
            if (editRef.current === abort) {
                editRef.current = null;
                setImageBusy(false);
            }
        }
    }
    const actions = scan?.actions ?? [];
    const activeId = active ?? actions.find(a => a.bbox && !a.marker_label)?.id ?? actions[0]?.id ?? null;
    const comparison = useMemo(() => simulated.length ? compareAssessments(evidence, simulatePlan(evidence, simulated)) : null, [evidence, simulated]);
    const statusLabels = {
        CONFIRMED_RISK: '已確認風險條件', POTENTIAL_RISK: '潛在風險',
        NEEDS_CONFIRMATION: '待確認', NO_RISK_IDENTIFIED: '此規則未辨識風險',
    };
    const card = (a: typeof actions[number], i: number) => {
        const selected = activeId === a.id;
        const located = positions[a.id] || (a.bbox && !a.marker_label);
        const caseIndex = a.id.startsWith('case-') ? Number(a.id.slice(5)) : null;
        const simulating = caseIndex !== null && simulated.includes(caseIndex);
        return <article id={`action-${a.id}`} className={`quick-action ${a.kind}`} data-selected={selected} key={a.id}>
            <span className="action-number" aria-hidden="true">{i + 1}</span>
            <div>
                <span className="finding-kind">{{risk:'已辨識的潛在風險',precaution:'待確認 · 植物辨識提醒',prevention:'預防準備',enrichment:'照護環境改善'}[a.kind]} · {a.priority === 'high' ? '高優先' : '中優先'}</span>
                <h3><button type="button" className="text-button scan-card-select" aria-label={`選取 ${i + 1}：${a.title}`} aria-pressed={selected} onClick={() => setActive(a.id)}>{a.title}</button></h3>
                <p className="small">{positions[a.id] ? '使用者確認位置' : located ? demo ? '示範座標' : 'AI 估計位置 · 可能有偏差' : '此項目尚未定位'}</p>
                {a.observation && <p><strong>影像觀察：</strong>{a.observation}</p>}
                {a.inference && <p><strong>可能情況：</strong>{a.inference}</p>}
                <p><strong>改善理由：</strong>{a.reason}</p>
                <p><strong>可能影響：</strong>{a.impact}</p>
                <p className="finding-action"><strong>建議：</strong>{a.action}</p>
                {a.unknown.length > 0 && <p className="small"><strong>待確認：</strong>{a.unknown.join('；')}</p>}
                {a.source_url && <p><a href={a.source_url} target="_blank" rel="noreferrer">查看照護依據</a></p>}
                <div className="scan-card-controls">
                    {(located || (a.object_index !== null && a.kind !== 'enrichment')) && <button type="button" className="text-button" onClick={() => {
                        setActive(a.id); setEditing(a.id);
                        const image = document.getElementById('room-annotations');
                        const bounds = image?.getBoundingClientRect();
                        if (bounds && (bounds.top < 0 || bounds.top >= window.innerHeight))
                            image?.scrollIntoView({behavior:'smooth', block:'start'});
                    }}>{located ? '修正位置' : '在照片上標記位置'}</button>}
                    {caseIndex !== null && a.kind === 'risk' && <button type="button" className="text-button" aria-pressed={simulating} onClick={() => {
                        setActive(a.id);
                        setSimulated(current => current.includes(caseIndex) ? current.filter(index => index !== caseIndex) : [...current, caseIndex]);
                    }}>{simulating ? '取消模擬' : '模擬改善'}</button>}
                </div>
                {simulating && comparison && <p className="scan-simulation-state"><strong>已模擬改善</strong> · {statusLabels[comparison.before[caseIndex].status]} → {statusLabels[comparison.after[caseIndex].status]}。現實狀態待重新驗證。</p>}
            </div>
        </article>;
    };

    return <main className={`shell quick-scan ${photo ? "has-photo" : ""}`}>
  <header className="topbar"><a className="brand" href="/"> <span className="brand-mark" aria-hidden="true">家</span>貓咪居家環境健檢</a><span className="brand-sub">單貓照護</span></header>
  <section className="quick-intro"><span className="eyebrow">照片健檢</span><h1>從真實的家，<br /><span className="headline-phrase">看見可以改善</span><span className="headline-phrase">的地方。</span></h1><p>讓 AI 協助發現居家環境中可能忽略的貓咪安全風險，並提供具體改善建議。</p></section>
  <section className="scan-picker" aria-label="選擇房間照片"><div className="scan-buttons">
   <label className="primary file-button">拍照<input type="file" capture="environment" accept="image/jpeg,image/png,image/webp" aria-label="拍照" onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ''; }}/></label>
   <label className="secondary file-button">{photo ? '重新上傳' : '上傳照片'}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={photo ? '重新上傳' : '上傳照片'} onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ''; }}/></label>
  </div><button type="button" className="text-button scan-demo-button" onClick={loadDemo}>試用虛構場景</button><p className="small">選擇照片即傳送至已設定的 Azure 分析；植物不確定時，會自動傳送原圖中的植物局部進一步辨識。照片只留在本次操作，不自動儲存。JPEG、PNG、WebP，15 MB 以下。</p></section>
  {phase && <div className="scan-progress" role="status"><span className="scan-spinner" aria-hidden="true"/>{phase}<p>分析完成前，不代表已排除風險。</p></div>}
  {error && <div className="scan-failure" role="alert"><h2>這次還沒完成分析</h2><p>{error}</p>{photo && <button className="primary" onClick={() => void analyze(photo, 0, true)}>重試分析</button>}</div>}
  {photo && !scan && <img className="scan-preview" src={photo} alt="本次房間照片"/>}
  {scan && record && <section className="scan-results" aria-label="掃描結果" data-analysis-calls={record.calls}>
   {demo && <p className="notice">虛構場景與測試資料 · 本次示範未呼叫 Azure</p>}
   <div className="scan-result-heading"><span className="eyebrow">這張照片的改善重點</span><h2>{scan.summary}</h2>{actions.length>0&&<p className="small">{scan.riskCount} 項可能風險 · {actions.filter(a=>a.kind==='precaution').length} 項植物辨識提醒 · {actions.filter(a=>a.kind==='prevention'||a.kind==='enrichment').length} 項預防與照護建議</p>}</div>
   {record.refinements?.some(r=>r.status==='failed')&&<p className="small refinement-note">部分植物精查未完成，保留首輪候選及其他環境分析；不代表植物安全。</p>}
   <div className="scan-result-grid"><div id="room-annotations"><ScanRoomPhoto key={photo} photo={photo} demo={demo} actions={actions} objectNames={record.candidate.objects.map(o=>o.label)} active={activeId} editing={editing} positions={positions} simulated={simulated} onActivate={setActive} onCancelLocate={() => setEditing(null)} onLocate={(id, point) => {setPositions(current => ({...current, [id]: point})); setEditing(null);}}/></div>
   <div className="priority-actions"><h3>優先處理</h3>{actions.slice(0, 3).map((a, i) => <div key={a.id} className="action-summary"><strong>{i+1} · {a.title}</strong><p>{a.action}</p><a href={`#action-${a.id}`} onClick={()=>setActive(a.id)}>{(positions[a.id] || (a.bbox && !a.marker_label)) ? '查看原因與位置' : '查看改善原因'}</a></div>)}
   {scan.plants.some(p => p.status === 'NON_TOXIC') && <aside className="retained-plants"><h3>不需因植物毒性而移除</h3>{scan.plants.filter(p => p.status === 'NON_TOXIC').map(p => <p key={p.object_index}>{p.label}｜未發現已知貓咪毒性。{p.action}</p>)}</aside>}
   {scan.quality !== 'adequate' && <p className="small">部分細節未能辨識，請靠近並保持清晰後重新拍照。</p>}
   </div></div>
   <section className="complete-findings" aria-label="完整風險與改善清單"><h2>完整風險與改善清單</h2>{actions.map(card)}{!actions.length&&<p>{scan.summary}</p>}</section>
   <p className="small scan-scope">僅限本次照片可見範圍，未發現問題不代表整個住家安全。植物外觀辨識可能有誤。</p>
   {!demo && !phase && targets.length > 0 && <ImageComparison photo={photo} evidence={evidence} objects={record.candidate.objects} result={imageResult} consent={true} busy={imageBusy} error={imageError} onConsent={() => { }} onGenerate={generateImage} onCancel={cancelImage} quick targets={targets.map(t => t.title)}/>}
   <section className="quick-plan"><h2>房間改善計畫</h2>{actions.length ? <ol>{actions.map(a => <li key={a.id}><strong>{a.title}</strong><p>{a.action}</p></li>)}</ol> : <p>{scan.summary}</p>}<button className="secondary" disabled={!!phase} onClick={() => window.print()}>儲存改善計畫／PDF</button></section>
  </section>}
  <footer><strong>做好家的準備，從一個小改善開始。</strong><p>AI 協助發現可能風險，不提供居家安全認證或獸醫診斷。</p></footer>
 </main>;
}
