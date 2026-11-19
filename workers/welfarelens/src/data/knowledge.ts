import { GUIDANCE_VERSION, GUIDANCE_SOURCES, SINGLE_CAT_GUIDANCE } from './single-cat-guidance.ts';
export const KNOWLEDGE_VERSION = GUIDANCE_VERSION;
const plantBase = "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/";
export const PLANTS = [
    ["Lilium species", "百合屬", "lily", "high"],
    ["Hemerocallis spp.", "萱草屬", "day-lilies-many-varieties", "high"],
    ["Cycas revoluta", "蘇鐵", "sago-palm", "high"],
    ["Epipremnum aureum", "黃金葛", "golden-pothos", "moderate"],
    ["Monstera deliciosa", "龜背芋", "swiss-cheese-plant", "moderate"],
    ["Aloe vera", "蘆薈", "aloe", "moderate"],
    ["Hedera helix", "常春藤", "english-ivy", "moderate"],
].map(([scientific_name, label, slug, severity]) => ({
    scientific_name,
    label,
    severity: severity as "high" | "moderate",
    toxic_to_cats: true,
    source_url: plantBase + slug,
    source_section: "Scientific Name; Toxicity",
    source_status: "VERIFIED" as const,
    checked_on: "2026-10-31",
}));
export const RULE_IDS = ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13', 'H14'] as const;
export type RuleId = typeof RULE_IDS[number];
export type Requirement = {
    key: string;
    hazard_value: boolean | string;
    question: string;
    manual_only?: boolean;
};
const req = (key: string, question: string, manual_only = false): Requirement => ({ key, hazard_value: true, question, manual_only });
const CONDITIONS: Record<RuleId, Requirement[]> = {
    H01: [req('opening_visible', '窗戶或陽台目前是否有開口？'), req('unguarded_opening', '此開口是否確實沒有合適阻隔？'), req('access_route', '貓是否可到達開口？')],
    H02: [{ key: 'species', hazard_value: 'listed_toxic', question: '植物學名是否能確認？', manual_only: true }, req('reachable', '貓是否可能接觸此植物？')],
    H03: [req('hazardous_substance', '是否確認為有害清潔用品、藥物或精油？', true), req('reachable', '是否能接觸該物品？')],
    H04: [req('exposed_cord', '是否有外露電線、垂落拉繩或線狀用品？'), req('reachable', '貓是否能接觸線材？')],
    H05: [req('concern_present', '是否確認家具不穩、活動機構或家電有夾困暴露？')],
    H06: [req('hazardous_food', '是否確認為對貓有害的食物？', true), req('reachable', '貓是否能接觸食物或垃圾？')],
    H07: [req('concern_present', '是否有如廁路線受阻、與飲食區集中，或已確認全屋配置不足？')],
    H08: [req('concern_present', '飲水是否與貓砂或食物集中，或已確認飲水安排不足？')],
    H09: [req('concern_present', '食碗是否與貓砂集中或位於容易受打擾的通道？')],
    H10: [req('concern_present', '是否已確認缺乏可用高處，或可見落腳面及抵達路線受阻？')],
    H11: [req('concern_present', '是否已確認未安排躲藏處，或可見入口被物品阻擋？')],
    H12: [req('concern_present', '是否已確認缺少合適抓撓設施或可見設施倒塌受阻？')],
    H13: [req('concern_present', '是否已確認休息區受氣味、噪音或直吹干擾，或可見休息位置受阻？')],
    H14: [req('concern_present', '是否可見遊戲動線受阻，或已確認缺乏互動與探索安排？')]
};
export type KnowledgeRule = {
    rule_id: RuleId;
    title: string;
    category: string;
    required_conditions: Requirement[];
    recommendation: string;
    description: string;
    potential_consequence: string;
    evidence_type: 'GUIDELINE_DERIVED';
    evidence_source: string;
    source_url: string;
    source_section: string;
    detection_limitations: string[];
    severity: 'high' | 'moderate';
    priority: 'HIGH' | 'BASIC' | 'ENRICHMENT';
    resolution: {
        key: string;
        value: boolean;
    };
};
export const RULES: KnowledgeRule[] = SINGLE_CAT_GUIDANCE.map(g => ({
    rule_id: g.id as RuleId, title: g.title, category: g.priority, priority: g.priority,
    required_conditions: CONDITIONS[g.id as RuleId], recommendation: g.application, description: g.principle,
    potential_consequence: g.priority === 'HIGH' ? '可能造成接觸、逃脫或受傷的暴露；需依實際條件處理。' : '可能限制貓自主飲食、排泄、退避、休息或探索的機會。',
    evidence_type: 'GUIDELINE_DERIVED', evidence_source: g.sources[0].id,
    source_url: GUIDANCE_SOURCES[g.sources[0].id].url, source_section: g.sources[0].section,
    detection_limitations: [g.photo_limit], severity: g.priority === 'HIGH' ? 'high' : 'moderate',
    resolution: g.id === 'H01' ? { key: 'unguarded_opening', value: false } : g.id === 'H02' ? { key: 'removed', value: true } : g.id === 'H03' ? { key: 'reachable', value: false } : g.id === 'H04' ? { key: 'exposed_cord', value: false } : g.id === 'H06' ? { key: 'reachable', value: false } : { key: 'concern_present', value: false }
}));
