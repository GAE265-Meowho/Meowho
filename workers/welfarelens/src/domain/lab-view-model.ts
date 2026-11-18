import { RULES } from '../data/knowledge.ts';
import { evaluateAssessment, compareAssessments } from './assessment.ts';
import type { Evidence } from './assessment.ts';
import type { Candidate } from './schema.ts';
import { planAction, simulatePlan } from './improvement-plan.ts';

export function inspectionItems(evidence: Evidence, objects: Candidate['objects']) {
  return evaluateAssessment(evidence).map((finding, index) => {
    const item = evidence.cases[index];
    const rule = RULES.find(r => r.rule_id === item.rule_id)!;
    const title = item.rule_id === 'H02' ? '植物品種與接觸' : rule.title;
    const action = planAction(item);
    return {
      index, title, finding, action,
      summary: action.split(/[。；]/u)[0],
      objectName: item.object_indices.map(i => objects[i]?.label).filter(Boolean).join('、') || '照片外／位置待確認',
      located: item.object_indices.some(i => !!objects[i]?.bbox),
      group: rule.priority === 'HIGH' ? 'safety' as const : 'resources' as const,
      priority: rule.priority === 'HIGH' ? '安全優先' : '生活改善',
      evidenceLabel: finding.status === 'CONFIRMED_RISK' ? rule.priority === 'HIGH' ? '已回報風險條件' : '已確認配置需求'
        : finding.status === 'POTENTIAL_RISK' ? rule.priority === 'HIGH' ? '可能風險' : '可改善配置'
        : finding.status === 'NO_RISK_IDENTIFIED' ? '未辨識此項風險' : '證據待補充',
    };
  });
}
export function preparationPlan(evidence: Evidence, selected: number[]) {
  const scenario = simulatePlan(evidence, selected);
  const diff = compareAssessments(evidence, scenario);
  const covered = new Set(evidence.cases.map(c => c.rule_id));
  return {
    ...diff,
    confirmations: diff.before.flatMap((f, index) => f.questions.map(q => ({ ...q, index, title: f.rule_id === 'H02' ? '植物品種與接觸' : f.title }))),
    actions: selected.map(index => ({ index, title: evidence.cases[index].rule_id === 'H02' ? '植物辨識與接觸管理' : diff.before[index].title, action: planAction(evidence.cases[index]), placement: evidence.cases[index].proposal?.placement })),
    unassessed: RULES.filter(r => !covered.has(r.rule_id)),
    resources: selected.filter(i => RULES.find(r => r.rule_id === evidence.cases[i].rule_id)!.priority !== 'HIGH').length,
  };
}
