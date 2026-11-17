// 跑酷（腳步聲 sfx_step、衝刺聲 sfx_dash）只在晚上放；白天不要腳步聲（渝茜 #456：「白天就不要了，要記得切斷音效」）。
// 3D 貓（cat.js）在每一幀自己決定要不要響腳步聲，拿不到遊戲的時間，所以 PlayGame 把「現在是不是晚上」放在這裡；
// 離開遊戲畫面時歸零（不然下次進後台檢視器還記著上次的值）。
let night = false;
export const setNightSfx = (v: boolean) => { night = v; };
export const isNightSfx = () => night;

/** 衝刺聲（sfx_dash）還該不該繼續：還在第 30 天半夜跑酷那一幕才繼續；換場、天亮、離開節點就切斷 */
export const dashStillOn = (step: string, pose: string | null, isNight: boolean): boolean => step === "node" && pose === "zoom" && isNight;
