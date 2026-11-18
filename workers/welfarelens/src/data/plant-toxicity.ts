import { PLANTS } from './knowledge.ts';
// Curated factual records, not a live or exhaustive ASPCA database. Verified 2026-11-01.
export const PLANT_TOXICITY = [
    ...PLANTS.map(p => ({ ...p, checked_on: '2026-11-01' })),
    { scientific_name: 'Chamaedorea elegans', label: '袖珍椰子', severity: 'moderate' as const, toxic_to_cats: false, source_url: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/parlor-palm', source_section: 'Scientific Name; Non-Toxicity', source_status: 'VERIFIED' as const, checked_on: '2026-11-01' },
    { scientific_name:'Philodendron hederaceum',label:'心葉蔓綠絨',severity:'moderate' as const,toxic_to_cats:true,source_url:'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/heartleaf-philodendron',source_section:'Scientific Name; Toxicity; Clinical Signs',source_status:'VERIFIED' as const,checked_on:'2026-11-01'},
    { scientific_name:'Dypsis lutescens',label:'散尾葵',severity:'moderate' as const,toxic_to_cats:false,source_url:'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/areca-palm',source_section:'Scientific Name; Non-Toxicity',source_status:'VERIFIED' as const,checked_on:'2026-11-01'},
];
export function lookupPlant(name: string) {
    const normalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
    const exact = PLANT_TOXICITY.find(p => p.scientific_name.toLowerCase() === normalized);
    if (exact)
        return exact;
    // ASPCA explicitly covers these genera; never generalize other genus records.
    if (/^(lilium|hemerocallis)\s+(?:[a-z-]+|spp?\.?|species)$/.test(normalized))
        return PLANT_TOXICITY.find(p => p.scientific_name.toLowerCase().startsWith(normalized.split(' ')[0] + ' '));
    return undefined;
}
