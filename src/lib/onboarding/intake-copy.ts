// 建檔對話小幫手的提問文案（#72）。語氣像中途愛媽聊天，不用 emoji。
import { LIFE_STAGES } from "../cat-profile/life-stage";
import { CARETAKER_LABEL } from "./household";
import { MAX_PHOTOS, MAX_VIDEOS, type IntakeState, type Notice, type Step } from "./conversation";

export const GREETING = "嗨，我是喵喵小幫手。用聊天的方式，一起建立你的喵戶吧。";

export function askText(step: Step, phase: IntakeState["phase"]): string {
  if (step.kind === "confirm_household") return "整理好了，看一下喵戶資料，沒問題就按「建立喵戶」。";
  if (step.kind === "confirm_fields") return "有幾個欄位是我從照片或影片猜的，請在名片上確認或修改。";
  if (step.kind === "confirm_cat") return "名片整理好了，確認沒問題就按「建立貓咪」。";
  switch (step.field) {
    case "caretakerType": return "先介紹一下你自己：你是個人中途、立案協會或收容單位，還是一般飼主呢？也可以一次說完，例如「我是台中北屯的個人中途，叫小橘之家」。";
    case "name": return phase === "household" ? "幫你的喵戶取個名字吧，例如「小橘之家」。" : "牠叫什麼名字呢？";
    case "location": return "喵戶在哪個縣市、哪一區呢？";
    case "photos": return `先上傳牠的照片吧，最多 ${MAX_PHOTOS} 張，也可以加 ${MAX_VIDEOS} 支 60 秒內的影片，我會先幫你看看。`;
    case "lifeStage": return "牠大約幾歲呢？說生日、大概幾歲，或直接選一個年齡層都可以。";
    case "description": return "說說牠的個性和小習慣吧，想到什麼就說什麼。說「先這樣」就直接看名片。";
  }
}

export const CARETAKER_CHIPS = Object.values(CARETAKER_LABEL);
export const LIFE_STAGE_CHIPS = LIFE_STAGES.map((s) => ({ id: s.id, label: s.label }));
export const REVIEW_CHIP = "先這樣";

export function noticeText(n: Notice): string | null {
  if (n === "not_cat") return "這張照片裡好像沒有看到貓，換一張清楚的貓咪照片試試？";
  if (n === "too_many_photos") return `照片最多 ${MAX_PHOTOS} 張，可以先移除一張再加。`;
  if (n === "too_many_videos") return `影片最多 ${MAX_VIDEOS} 支，可以先移除一支再加。`;
  return null;
}
