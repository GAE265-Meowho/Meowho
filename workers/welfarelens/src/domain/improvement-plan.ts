import { RULES, PLANTS } from '../data/knowledge.ts';
import { EvidenceSchema, simulateAssessment } from './assessment.ts';
import type { Evidence } from './assessment.ts';
import type { Candidate } from './schema.ts';
type Case = Evidence['cases'][number];
export function primaryObjectIndex(item: Case, objects: Candidate['objects']): number | null {
    const kinds: Record<string, string[]> = { H01: ['window'], H02: ['plant'], H04: ['cord'], H05: ['furniture'], H11: ['hideout', 'furniture'] };
    return item.object_indices.find(i => kinds[item.rule_id]?.includes(objects[i]?.kind)) ?? item.object_indices[0] ?? null;
}
export function planAction(item: Case): string {
    if (item.rule_id === 'H02') {
        const species = item.facts.find(f => f.key === 'species');
        const plant = PLANTS.find(p => p.scientific_name.toLowerCase() === String(species?.value).trim().toLowerCase());
        if (!plant)
            return '補拍葉片、莖及植物標籤以辨識學名；確認前避免貓接觸，不直接判為有毒或要求丟棄。';
        return `${species?.status === 'CONFIRMATION' ? '已確認' : '若學名確認為'}${plant.label}（${plant.scientific_name}），依 ASPCA 已收錄毒性安排移除；${plant.severity === 'high' ? '不要僅以放高處替代移除。' : '不要放在貓能接觸的位置。'}`;
    }
    return item.proposal?.action ?? RULES.find(r => r.rule_id === item.rule_id)!.recommendation;
}
export function simulatePlan(raw: Evidence, selected: number[]): Evidence {
    const input = EvidenceSchema.parse(raw);
    if (new Set(selected).size !== selected.length || selected.some(i => !Number.isInteger(i) || !input.cases[i]))
        throw new Error('Invalid plan selection');
    const applicable = selected.filter(i => input.cases[i].rule_id !== 'H02' || PLANTS.some(p => p.scientific_name.toLowerCase() === String(input.cases[i].facts.find(f => f.key === 'species')?.value).trim().toLowerCase()));
    return simulateAssessment(input, applicable.map(case_index => ({ case_index, ...RULES.find(r => r.rule_id === input.cases[case_index].rule_id)!.resolution })));
}
