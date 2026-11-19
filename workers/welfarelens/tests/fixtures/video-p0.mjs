// Reconstructed scenarios informed by local video + old PDF, NOT original Azure JSON.
export const provenance={
 pdf:{path:'WelfareLens｜領養前的居家照護實驗室.pdf',pages:19,recordedEvents:50,riskEvents:7,otherEvents:43,timestamps:[0,4,8,9,10,11,12,13]},
 directVideo:{duration:14.015,width:3840,height:2160,verified:'Contact sheet: hanging lines under wall shelf over black sofa at 0/4s; tripod lamp and upright-leaf potted plant at 8/12s. No botanical identity, toxicity or electrical state verified.'},
 synthetic:'Structured events, rule facts, matches and identities below are test reconstructions; never recovered Azure responses.'
};
export const id='11111111-1111-4111-8111-111111111111';
export function observation(name,overrides={}){
 const frame_id=overrides.frame_id??'f000',timestamp=overrides.timestamp??0;
 return {observation_id:name,event_ids:[`event-${name}`],frame_id,timestamp,frame_hash:`image-${frame_id}`,rule_id:'H04',object_ref:0,object_kind:'cord',object_label:'壁架下線材',candidate_bbox:null,facts:[],plant:null,quality:'adequate',fidelity:'validated_candidate',kind:'risk',severity:'moderate',title:'壁架下線材',observation:'壁架下線材垂向沙發靠背',potential_risk:'貓可能由沙發接近線材',recommendation:'將線收入保護套並沿牆固定',unknown:['無法從影像得知是否通電'],sources:['https://www.cats.org.uk/help-and-advice/caring-for-your-cat/home-and-environment/keeping-your-cat-safe'],model:'fixture',...overrides};
}
export function match(a,b,same=true){return {id:`match-${a}-${b}`,observation_ids:[a,b],kind:'test_ground_truth',supports_same_object:same,provenance:'Synthetic pair labels informed by local frame review; not an automated correspondence'};}
export function roomFixture(){
 const observations=[observation('shelf-0'),observation('shelf-4',{frame_id:'f004',timestamp:4}),observation('lamp-8',{frame_id:'f008',timestamp:8,object_label:'落地燈線材',title:'落地燈線材'}),observation('pot-8',{frame_id:'f008',timestamp:8,rule_id:'H02',object_ref:1,object_kind:'plant',title:'疑似直立葉盆栽',kind:'precaution'}),observation('pot-12',{frame_id:'f012',timestamp:12,rule_id:'H02',object_ref:1,object_kind:'plant',title:'疑似直立葉盆栽',kind:'precaution'})];
 for(const [rule,title] of [['H11','躲藏空間'],['H12','磨爪位置'],['H14','遊戲探索']])for(const timestamp of [0,4,8,12])observations.push(observation(`${rule}-${timestamp}`,{rule_id:rule,kind:'enrichment',title,frame_id:`f${String(timestamp).padStart(3,'0')}`,timestamp,object_kind:'furniture',object_label:'沙發',recommendation:`可考慮安排${title}`}));
 return {observations,matches:[match('shelf-0','shelf-4'),match('shelf-0','lamp-8',false),match('shelf-4','lamp-8',false),match('pot-8','pot-12')]};
}
