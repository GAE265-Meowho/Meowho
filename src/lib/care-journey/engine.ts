/** AI Care Journey paper-v1-inspired deterministic demo rules. No real cat or medical inference. */
export type CatId = "xiaohe" | "ali" | "mili" | "songsong";
export type Stage = "kitten" | "adult" | "mature" | "senior";
export type ItemId = "box" | "mat" | "litter" | "lowLitter" | "carrier";
export type Place = "storage" | "floor" | "accessible";
export type ItemPlacement = Partial<Record<ItemId, Place>>;
export interface DemoCat { id: CatId; name: string; age: number; known: string; unknown: string; source: string; required: ItemId[]; stage: Stage; }
export interface Commitment { id: string; label: string; status: "confirmed" | "pending"; source: string; }
export interface JourneyState { cat: DemoCat; placements: ItemPlacement; commitments: Commitment[]; history: string[]; scope: "current" | "future" | "teaching"; stage: Stage; }
export const cats: Record<CatId,DemoCat> = {
 xiaohe:{id:"xiaohe",name:"小禾",age:4,stage:"adult",known:"原照顧環境曾使用原休息箱與原墊；交接要求延續原用品並維持入口可達。",unknown:"新家是否使用原箱、對新位置及工作聲音的反應。",source:"X-OBS／X-REQ（虛構教學）",required:["box","mat"]},
 ali:{id:"ali",name:"阿栗",age:4,stage:"adult",known:"原環境使用地面休息墊與低入口盆；交接要求必要用品可以從地面取用。",unknown:"地面取用要求的原因與新家使用情況。",source:"Y-OBS／Y-REQ（虛構教學）",required:["lowLitter"]},
 mili:{id:"mili",name:"米粒",age:0.5,stage:"kitten",known:"沒有已確認外出籠熟悉紀錄。",unknown:"是否已熟悉外出籠；不能推斷害怕。",source:"K-AGE／K-OBS（虛構教學）",required:[]},
 songsong:{id:"songsong",name:"松松",age:12,stage:"senior",known:"原環境使用低入口盆；交接要求維持必要用品的地面取用。",unknown:"個體要求的原因、新環境反應及健康狀況。",source:"O-OBS／O-REQ（虛構教學）",required:["lowLitter"]}
};
export const stages: {id:Stage; title:string; lesson:string; action:string}[]=[
 {id:"kitten",title:"幼年",lesson:"漸進熟悉外出籠，不把一次放置當成訓練完成。",action:"建立外出籠熟悉計畫"},
 {id:"adult",title:"成年",lesson:"到場不等於完成任務交接，需要確認人、時間及具體要求。",action:"建立照護交接"},
 {id:"mature",title:"熟齡",lesson:"先記錄可比較的日常觀察，不從資訊不足的紀錄推論疾病。",action:"建立一致觀察計畫"},
 {id:"senior",title:"老年",lesson:"檢查用品可及性與未來備援，不憑年齡推斷失能。",action:"重新檢查取用與備援"}
];
export function initialState(id:CatId):JourneyState {const cat=cats[id];return {cat,stage:cat.stage,scope:"current",placements:{box:"storage",mat:"storage",litter:"floor",lowLitter:"storage",carrier:"storage"},commitments:[],history:[]};}
export function unmet(state:JourneyState):string[] {const p=state.placements,c=state.cat;const issues:string[]=[];if(c.id==="xiaohe" && (p.box!=="accessible"||p.mat!=="accessible"))issues.push("原箱與原墊尚未安排到可取用的生活區");if((c.id==="ali"||c.id==="songsong")&&(p.lowLitter!=="accessible"||p.litter!=="storage"))issues.push("仍需換上低入口盆並維持地面取用");return issues;}
export function place(state:JourneyState,item:ItemId):JourneyState {const allowed=(state.cat.id==="xiaohe"&&["box","mat"].includes(item))||(["ali","songsong"].includes(state.cat.id)&&item==="lowLitter")||(state.stage==="kitten"&&item==="carrier");if(!allowed)return state;const placements={...state.placements,[item]:"accessible" as Place};if(item==="lowLitter")placements.litter="storage";return {...state,placements,history:[...state.history,"安排用品："+item]};}
export function addCommitment(state:JourneyState, commit:Commitment):JourneyState {if(state.commitments.some(c=>c.id===commit.id))return state;return {...state,commitments:[...state.commitments,commit],history:[...state.history,commit.label]};}
export function moveToStage(current:JourneyState,stage:Stage):JourneyState {if(stage==="kitten"&&current.cat.age>=1) return {...initialState("mili"),scope:"teaching",stage:"kitten"};return {...current,scope: stage===current.cat.stage?"current":"future",stage,placements:{...current.placements},commitments:current.commitments.map(x=>({...x})),history:[...current.history]};}
export function bringBackPreparation(current:JourneyState,future:JourneyState):JourneyState {if(future.scope!=="future"||future.cat.id!==current.cat.id)return current;const todo=future.commitments.filter(x=>x.source==="future");const newOnes=todo.filter(x=>!current.commitments.some(y=>y.id===x.id)).map(x=>({...x,status:"pending" as const}));return {...current,commitments:[...current.commitments,...newOnes],history:[...current.history,...newOnes.map(x=>"未來準備："+x.label)]};}
