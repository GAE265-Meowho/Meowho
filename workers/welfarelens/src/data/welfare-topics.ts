import type {RuleId} from './knowledge.ts';

export const TOPIC_CATALOG_VERSION='welfarelens.cat-welfare-topics.v1';
const cp='https://www.cats.org.uk/help-and-advice/';
const aspca='https://www.aspca.org/pet-care/';
export const topicSources={
 guidelines:{title:'AAFP／ISFM 貓咪環境需求指引（2013）',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11383066/',type:'clinical_guideline'},
 position:{title:'FelineVMA 室內貓身心需求立場聲明（2025）',url:'https://catvets.com/resource/2025-meeting-the-physical-and-emotional-needs-of-indoor-cats/',type:'position_statement'},
 safety:{title:'Cats Protection｜貓咪居家安全',url:cp+'caring-for-your-cat/home-and-environment/keeping-your-cat-safe',type:'welfare_guidance'},
 preparation:{title:'Cats Protection｜迎接貓咪的居家準備',url:cp+'getting-a-cat/preparing-for-a-cat',type:'welfare_guidance'},
 indoor:{title:'Cats Protection｜室內貓照護',url:cp+'caring-for-your-cat/home-and-environment/indoor-cats',type:'welfare_guidance'},
 plants:{title:'ASPCA｜貓咪植物毒性資料庫',url:aspca+'animal-poison-control/cats-plant-list',type:'toxicology_database'},
 plantSafety:{title:'Cats Protection｜對貓有害的植物',url:cp+'caring-for-your-cat/home-and-environment/dangerous-plants',type:'welfare_guidance'},
 snake:{title:'ASPCA｜虎尾蘭',url:aspca+'aspca-poison-control/toxic-and-non-toxic-plants/snake-plant',type:'toxicology_database'},
 monstera:{title:'ASPCA｜龜背芋',url:aspca+'aspca-poison-control/toxic-and-non-toxic-plants/swiss-cheese-plant',type:'toxicology_database'},
} as const;
export type TopicSource=keyof typeof topicSources;
type Pattern={mode:'object'|'placement';kind?:string;facts?:readonly string[];requirePlantConcern?:true;change:string};
type Topic={
 topic_id:string;title_zh:string;topic_kind:'hazard_prevention'|'welfare_enrichment';rules:readonly RuleId[];
 authoritative_source_refs:readonly {id:TopicSource;section:string}[];
 relevant_observable_indicators:readonly string[];required_conditions:readonly string[];unknown_conditions:readonly string[];
 recommended_actions:readonly string[];visual_improvement_patterns:readonly Pattern[];
 before_evidence_requirements:readonly string[];after_visual_requirements:readonly string[];exclusion_conditions:readonly string[];
};
const source=(id:TopicSource,section:string)=>({id,section});
function topic(id:string,title:string,kind:Topic['topic_kind'],rules:Topic['rules'],refs:Topic['authoritative_source_refs'],
 indicator:string,unknown:string,actions:string[],patterns:Pattern[]=[]):Topic{
 return {topic_id:id,title_zh:title,topic_kind:kind,rules,authoritative_source_refs:refs,
  relevant_observable_indicators:[indicator],required_conditions:['有可追溯且與建議相關的畫面觀察'],
  unknown_conditions:[unknown],recommended_actions:actions,visual_improvement_patterns:patterns,
  before_evidence_requirements:['清楚的原始影格','具體且可定位的目標或擺放區域'],
  after_visual_requirements:['維持視角、格局及非目標物件','可辨識的指定改變與對應局部','人工審閱通過'],
  exclusion_conditions:['畫面未拍到不足以推論全屋缺少資源','無法核實的物理條件僅列現場查核',...(patterns.length?[]:['目前只列文字建議'])]};
}
const placement=(change:string):Pattern=>({mode:'placement',change});
export const WELFARE_TOPICS=[
 topic('cords','電線、拉繩與可吞食小物','hazard_prevention',['H04'],[source('safety','Common household hazards: wires, string and bands')],
  '可見的外露或垂落線材','通電與可接觸性須現場查核',['將外露線材固定並收進理線槽或保護套。','使用完線狀玩具後收好。'],
  [{mode:'object',kind:'cord',facts:['exposed_cord'],change:'將目標外露線段固定並收進細窄理線槽，保留原有家具和其他線材。'}]),
 topic('plants','植物接觸管理','hazard_prevention',['H02'],[source('plants','學名及 Toxicity 欄位'),source('plantSafety','室內有害植物')],
  '可辨識的盆栽與需要預防接觸的候選資訊','畫面無法單獨定種或判定中毒',['先阻隔接觸，依學名確認毒性。','確認為有害植物後，安排適當移除。'],
  [{mode:'object',kind:'plant',requirePlantConcern:true,change:'預防性移位示意。只移開指定盆栽，保留其餘植物；不要暗示已確認物種。'}]),
 topic('household-substances','清潔用品與食品收納','hazard_prevention',['H03','H06'],[source('safety','Cats and cleaning products'),source('preparation','Setting up a space for your new cat')],
  '可見、可能接觸的容器或食物','內容物、成分與濃度',['將已知有害的物品收進貓無法接觸的地方。']),
 topic('furnishings','家具、物件與家電','hazard_prevention',['H05'],[source('preparation','Setting up a space for your new cat'),source('safety','Common household hazards: appliances and reclining chairs')],
  '可見的家具配置或夾困位置','固定、承重與操作習慣須現場確認',['現場查核家具固定及家電使用前的安全。']),
 topic('openings','窗戶、陽台與開口','hazard_prevention',['H01'],[source('safety','Common household hazards: windows'),source('indoor','How to cat-proof a balcony')],
  '可清楚看見的開啟窗扇','防護強度與貓實際可達性',['先關閉可接近的開口，開窗前評估防墜防逃措施。'],
  [{mode:'object',kind:'window',facts:['opening_visible'],change:'只將指定的可見開啟窗扇描繪為關閉。不要新增網材或宣稱安全規格。'}]),
 topic('resources','飲食、飲水、如廁及進出動線','welfare_enrichment',['H07','H08','H09'],[source('guidelines','Pillar 2'),source('preparation','Litter trays; Food and water bowls')],
  '可見的資源相鄰或出入口配置','全屋資源數量、通行習慣與干擾程度',['將飲食、飲水與如廁資源分開，保留進出空間。']),
 topic('vertical','垂直探索','welfare_enrichment',['H10'],[source('guidelines','Pillars 1–2'),source('preparation','Hiding places')],
  '可見且預先定位的擺放區域','承重與個體上下能力',['可考慮容易上下的穩固低台。'],
  [placement('在指定可見區域加一座獨立、低矮的貓跳台，保留動線，遠離開口。')]),
 topic('refuge','休息與躲藏','welfare_enrichment',['H11','H13'],[source('guidelines','Pillars 1 and 5'),source('preparation','Beds; Hiding places')],
  '可見且有進出空間的擺放位置','噪音、氣味與全屋休息資源',['可在合適位置設置可自由進出的躲藏窩。'],
  [placement('在指定空間放置一個開口朝向空地的躲藏窩，保持出入口及通道。')]),
 topic('scratching','磨爪設施','welfare_enrichment',['H12'],[source('guidelines','Pillar 2'),source('preparation','Scratching posts')],
  '可見且不阻擋動線的擺放位置','貓咪偏好與設施實際穩定度',['可在合適位置提供穩固的抓柱或抓板。'],
  [placement('在指定的空地加一座低重心、寬底座的抓柱，保持通道。')]),
 topic('play','遊戲、探索及活動空間','welfare_enrichment',['H14'],[source('guidelines','Pillar 3'),source('position','Five pillars'),source('preparation','Cat toys')],
  '清楚可見的活動空間與建議區域','遊戲頻率及貓咪偏好',['提供互動遊戲與適合的益智餵食活動。'],
  [placement('在指定的空地加一個低矮益智餵食玩具，保持通道；不要新增線繩。')]),
];

export const welfareTopicForRule=(rule:string|null)=>WELFARE_TOPICS.find(item=>item.rules.some(id=>id===rule));
