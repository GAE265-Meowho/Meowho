import { EvidenceSchema, evaluateAssessment } from './assessment.ts';
import type { Evidence } from './assessment.ts';
import type { Candidate } from './schema.ts';
import { primaryObjectIndex, planAction } from './improvement-plan.ts';
import { RULES, PLANTS } from '../data/knowledge.ts';
/** Recommendations are a plan, never a simulated or verified change of evidence. */
export function buildRoomPlan(raw: Evidence, objects: Candidate['objects']) {
    const evidence = EvidenceSchema.parse(raw);
    const findings = evaluateAssessment(evidence);
    const actions = evidence.cases.flatMap((item, index) => {
        const finding = findings[index];
        if (!item.proposal && finding.status === 'NO_RISK_IDENTIFIED')
            return [];
        const primary = primaryObjectIndex(item, objects);
        const box = primary == null ? null : objects[primary]?.bbox ?? null;
        const species = item.facts.find(f => f.key === 'species');
        const knownPlant = species?.status === 'CONFIRMATION' && PLANTS.some(p => p.scientific_name.toLowerCase() === String(species.value).toLowerCase());
        // Species inference alone cannot authorize removing a plant in an edited photo.
        const visual = item.rule_id === 'H02' ? knownPlant && !!box
            : !!item.proposal && (!!item.proposal.placement?.bbox || (!!box && item.rule_id !== 'H11'));
        return [{ index, rule_id: item.rule_id, title: item.rule_id === 'H02' ? '植物辨識與接觸管理' : finding.title,
                objectName: primary == null ? '建議配置位置' : objects[primary]?.label ?? '位置待補充',
                action: planAction(item), rationale: item.proposal?.rationale ?? finding.explanation,
                placement: item.proposal?.placement ?? null, box, visual: !!visual,
                source_url: finding.source_url, source_section: finding.source_section }];
    });
    return { actions, visualEdits: actions.filter(a => a.visual), findings,
        confirmations: findings.flatMap((f, index) => f.questions.map(q => ({ ...q, index, title: f.rule_id === 'H02' ? '植物品種與接觸' : f.title }))),
        unassessed: RULES.filter(r => !evidence.cases.some(c => c.rule_id === r.rule_id)) };
}
