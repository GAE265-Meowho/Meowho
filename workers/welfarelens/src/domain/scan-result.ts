import { CandidateSchema } from './schema.ts';
import type { Candidate } from './schema.ts';
import { evaluateAssessment } from './assessment.ts';
import { lookupPlant } from '../data/plant-toxicity.ts';
import { RULES } from '../data/knowledge.ts';
import {primaryObjectIndex} from './improvement-plan.ts';
export type ScanAction = {
    id: string;
    title: string;
    action: string;
    priority: 'high' | 'moderate';
    object_index: number | null;
    bbox: Candidate['objects'][number]['bbox'];
    source_url: string | null;
    kind: 'risk' | 'precaution' | 'prevention' | 'enrichment';
    observation: string;
    inference: string;
    reason: string;
    impact: string;
    unknown: string[];
    marker_label?: string;
};
export type PlantResult = {
    object_index: number;
    status: 'TOXIC' | 'NON_TOXIC' | 'UNKNOWN';
    label: string;
    scientific_name: string | null;
    action: string;
    sources: string[];
    highConcern: boolean;
    candidates: {name:string;scientific_name:string;toxicity:'TOXIC'|'NON_TOXIC'|'UNLISTED';source_url:string|null}[];
    features: string;
};
/** This is a bounded decision policy over model hypotheses, not calibrated botanical certainty. */
export function buildScanResult(raw: Candidate) {
    const candidate = CandidateSchema.parse(raw), quality = candidate.image_quality ?? 'limited';
    const plants: PlantResult[] = candidate.objects.flatMap((o, index) => {
        if (o.kind !== 'plant')
            return [];
        const identification = candidate.plants?.find(p => p.object_index === index);
        const names = identification?.candidates ?? [];
        const records = names.map(n => lookupPlant(n.scientific_name));
        const highConcern = records.some(r => r?.severity === 'high');
        const reliable = quality !== 'unusable' && identification?.identification_quality === 'adequate' && !!identification.features.trim() && names.length > 0 && names.every(n => n.confidence === 'high');
        const unique = new Set(names.map(n => n.scientific_name.trim().toLowerCase()));
        const known = records.every(r => r !== undefined);
        const record = reliable && unique.size === 1 && known ? records[0] : undefined;
        const nonToxic = reliable && known && records.every(r => r?.toxic_to_cats === false);
        const status = record?.toxic_to_cats ? 'TOXIC' : nonToxic ? 'NON_TOXIC' : 'UNKNOWN';
        const label = record?.label ?? (nonToxic ? records[0]!.label : '暫時無法確認植物安全性');
        const toxicNames=[...new Set(records.flatMap(r=>r?.toxic_to_cats?[r.label]:[]))];
        const action = status === 'TOXIC' ? (highConcern ? '移開這盆植物，避免貓咪接觸；若已接觸或誤食，立即聯絡獸醫。' : '建議移至貓咪無法接觸的地方。')
            : status === 'NON_TOXIC' ? '不需要因植物毒性而移除。'
            : highConcern?'候選包含高危植物，先移開、避免貓咪接觸；若已接觸或誤食，立即聯絡獸醫。'
            : toxicNames.length?`有毒候選包含${toxicNames.join('、')}；定種前先避免貓咪接觸，移至貓無法進入的空間。`
            : names.length&&known?'目前候選皆有非毒性紀錄，但品種尚未確定；先避免貓咪接觸或啃食，不因候選就要求移除。':'建議先避免貓咪接觸。';
        return [{ object_index: index, status, label, scientific_name: record?.scientific_name ?? null, action, sources: [...new Set(records.flatMap(r => r ? [r.source_url] : []))], highConcern,
            features:identification?.features??'',candidates:names.map((n,i)=>({name:records[i]?.label??n.common_name,scientific_name:n.scientific_name,toxicity:records[i]?records[i]!.toxic_to_cats?'TOXIC' as const:'NON_TOXIC' as const:'UNLISTED' as const,source_url:records[i]?.source_url??null})) }];
    });
    const actions: ScanAction[] = plants.filter(p => p.status !== 'NON_TOXIC').map(p => ({ id: `plant-${p.object_index}`, title: p.status === 'TOXIC' ? `${p.label}｜對貓有毒` : p.candidates.length?`疑似${p.candidates.map(c=>c.name||c.scientific_name).join('／')}`:p.label, action: p.action, priority: p.highConcern ? 'high' : 'moderate', object_index: p.object_index, bbox: candidate.objects[p.object_index].bbox, source_url: p.sources[0] ?? null, kind: p.status === 'TOXIC' ? 'risk' : 'precaution',
        observation:p.features||candidate.objects[p.object_index].notes,inference:'',reason:p.candidates.length?p.candidates.map(c=>`${c.name}（${c.scientific_name}）：${c.toxicity==='TOXIC'?'ASPCA 有毒性紀錄':c.toxicity==='NON_TOXIC'?'ASPCA 列為非毒性':'本機資料未收錄，不能視為安全'}`).join('；'):'影像暫不支持具體物種候選。',impact:p.highConcern?'若候選屬實，接觸或誤食可能造成嚴重傷害。':p.candidates.some(c=>c.toxicity==='TOXIC')?'若有毒候選屬實，接觸或啃食可能造成傷害。':'仍有未確認或未收錄的候選，不能由本次影像判定接觸或誤食是否無害。',unknown:p.status==='UNKNOWN'?['暫時無法確認植物安全性；候選並非已確認品種。']:[] }));
    const evidence = { version: 1 as const, capture_id: 'scan', mode: 'OBSERVED' as const, cases: candidate.assessments ?? [] };
    const findings = evaluateAssessment(evidence);
    const seen = new Set<string>();
    if (quality !== 'unusable')
        for (const [i, item] of evidence.cases.entries()) {
            if (item.rule_id === 'H02')
                continue;
            const facts = new Map(item.facts.map(f => [f.key, f]));
            const yes = (key: string) => { const f = facts.get(key); return f?.value === true && f.status !== 'UNKNOWN' && f.confidence !== 'low'; };
            const visible = (key: string) => yes(key) && facts.get(key)?.status === 'OBSERVATION';
            const relevant = item.rule_id === 'H01' ? visible('opening_visible') && yes('access_route') && !(facts.get('unguarded_opening')?.value === false && facts.get('unguarded_opening')?.status === 'OBSERVATION' && facts.get('unguarded_opening')?.confidence !== 'low')
                : item.rule_id === 'H04' ? visible('exposed_cord') && yes('reachable')
                    : item.rule_id === 'H03' ? visible('hazardous_substance') && yes('reachable')
                        : item.rule_id === 'H06' ? visible('hazardous_food') && yes('reachable')
                            : yes('concern_present');
            const grounded = item.object_indices.some(index=>candidate.objects[index]?.notes.trim()) || (item.object_indices.length>0 && item.facts.some(f=>f.value!==null&&f.status!=='UNKNOWN'&&f.evidence.trim()));
            const suggestion = grounded && item.proposal && item.proposal.kind!=='RISK';
            if (!relevant && !suggestion)
                continue;
            const index = primaryObjectIndex(item,candidate.objects), object = index === null ? null : candidate.objects[index];
            const actionKey = `${item.rule_id}:${index}`;
            if (seen.has(actionKey))
                continue;
            seen.add(actionKey);
            const rule = RULES.find(r => r.rule_id === item.rule_id)!;
            const kind= item.proposal?.kind==='PREVENTION'?'prevention' as const:item.proposal?.kind==='ENRICHMENT'?'enrichment' as const:'risk' as const;
            const proposedBox=item.proposal?.placement?.bbox;
            const box=kind==='enrichment'?(proposedBox?[...proposedBox] as Candidate['objects'][number]['bbox']:null):object?.bbox??null;
            actions.push({ id: `case-${i}`, title: object&&object.label!==rule.title?`${object.label}｜${rule.title}`:rule.title, action: item.proposal?.action ?? (item.rule_id === 'H01' ? '先關閉可接近的開口，使用前安裝可靠的防墜防逃防護。' : findings[i].recommendation), priority: kind==='risk'?findings[i].severity:'moderate', object_index: index, bbox:box, ...(kind==='enrichment'&&box?{marker_label:`${rule.title}建議配置區`}:{}), source_url: findings[i].source_url, kind,
                observation:item.facts.filter(f=>f.status==='OBSERVATION'&&f.value!==null).map(f=>f.evidence).join('；')||object?.notes||'',
                inference:item.facts.filter(f=>f.status==='INFERENCE'&&f.value!==null).map(f=>f.evidence).join('；'),
                reason:item.proposal?.rationale??findings[i].explanation,impact:item.proposal?.impact??rule.potential_consequence,
                unknown:item.facts.filter(f=>f.status==='UNKNOWN').map(f=>f.evidence)
            });
        }
    const rank={risk:0,prevention:1,precaution:2,enrichment:3};
    actions.sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || rank[a.kind]-rank[b.kind]);
    const riskCount = actions.filter(a => a.kind === 'risk').length;
    const summary = quality === 'unusable' ? '照片不夠清楚，請重新拍攝。' : quality === 'limited' ? '照片部分細節不清楚；以下是目前能辨識的項目。' : riskCount ? `發現 ${riskCount} 項需要改善` : actions.some(a=>a.kind==='prevention'||a.kind==='enrichment')?`找到 ${actions.length} 項居家照護改善建議`:actions.length ? '有植物暫時無法確認安全性，先避免貓咪接觸。' :'這張照片未發現需要立即處理的明確風險。';
    return { quality, summary, actions, plants, riskCount };
}
export type ScanResult = ReturnType<typeof buildScanResult>;
/** Minimal image targets derived from the same bounded action policy; no species guesses. */
export function buildScanEdits(candidate: Candidate) {
    const scan = buildScanResult(candidate);
    if (scan.quality === 'unusable')
        return [];
    return scan.actions.flatMap(a=>{
        const item=a.id.startsWith('case-')?candidate.assessments?.[Number(a.id.split('-')[1])]:undefined;
        const placement=item?.proposal?.placement??null;
        const sourceBox=a.object_index!==null?candidate.objects[a.object_index].bbox:null;
        if(a.kind==='precaution'||(!a.bbox&&!placement?.bbox&&!(placement&&sourceBox))||(a.kind==='enrichment'&&!placement))return [];
        return [{rule_id:a.id.startsWith('plant-')?'H02':item?.rule_id??'H01',objectName:a.title,title:a.title,action:a.id.startsWith('plant-')?'將這盆已匹配有毒資料的植物移出房間，其他植物保留。':a.action,box:sourceBox??a.bbox,placement}];
    });
}
