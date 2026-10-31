// 建檔對話草稿 → 資料表欄位（#72），以及檢查瀏覽器送來的草稿。
// 新建的喵戶預設接受私訊、公開；新建的貓一律是公開的待領養貓。
import { z } from "zod";
import { HEALTH_TAGS, PERSONALITY_TAGS } from "../cat-profile/tags";
import { MAX_PHOTOS, MAX_TIMELINE, MAX_VIDEOS, type CatFields, type HouseholdFields } from "./conversation";

export function toHouseholdInsert(h: HouseholdFields) {
  return {
    name: h.name.trim(),
    caretaker_type: h.caretakerType,
    city: h.city,
    district: h.district,
    intro: h.intro.trim(),
    allow_stranger_messages: true,
    default_visibility: "public" as const,
  };
}

export function toCatInsert(c: CatFields, ids: { id: string; householdId: string; coverUrl: string | null }) {
  return {
    id: ids.id,
    household_id: ids.householdId,
    name: c.name.trim(),
    sex: c.sex ?? "unknown",
    birthday: c.birthday,
    est_age_months: c.birthday ? null : c.estAgeMonths,
    life_stage: c.lifeStage,
    coat: c.coat,
    breed: c.breed,
    personality_tags: c.personalityTags,
    health_tags: c.healthTags,
    // 舊欄位 neutered 給「我的喵戶」等既有畫面用
    neutered: c.healthTags.includes("已結紮") ? true : null,
    description: c.description,
    timeline: c.timeline,
    photo_paths: c.photos,
    // 舊欄位 photo_url 放封面網址，給既有畫面相容；新程式讀 photo_paths
    photo_url: ids.coverUrl,
    status: "adoptable" as const,
    visibility: "public" as const,
  };
}

export interface VideoMeta { durationSec: number; tags: string[]; reason: string | null }

export const toCatVideoInserts = (catId: string, paths: string[], meta: Record<string, VideoMeta>) =>
  paths.map((path) => ({
    cat_id: catId,
    storage_path: path,
    duration_sec: Math.max(1, Math.ceil(meta[path]?.durationSec ?? 1)),
    ai_personality_tags: meta[path]?.tags ?? [],
    ai_reason: meta[path]?.reason ?? null,
  }));

const str = (max: number) => z.string().max(max);
const nullableStr = (max: number) => str(max).nullable();

export const IntakeStateSchema = z.object({
  phase: z.enum(["household", "cat"]),
  household: z.object({
    caretakerType: z.enum(["personal_foster", "shelter_org", "cat_owner"]).nullable(),
    name: str(30),
    city: nullableStr(10),
    district: nullableStr(10),
    intro: str(500),
  }),
  cat: z.object({
    name: str(30),
    sex: z.enum(["male", "female", "unknown"]).nullable(),
    birthday: nullableStr(10),
    estAgeMonths: z.number().int().min(0).max(400).nullable(),
    lifeStage: z.enum(["kitten", "young_adult", "mature_adult", "senior"]).nullable(),
    coat: nullableStr(40),
    breed: nullableStr(40),
    personalityTags: z.array(z.enum(PERSONALITY_TAGS)).max(PERSONALITY_TAGS.length),
    healthTags: z.array(z.enum(HEALTH_TAGS)).max(HEALTH_TAGS.length),
    description: nullableStr(2000),
    timeline: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), event: str(200) })).max(MAX_TIMELINE),
    photos: z.array(str(300)).max(MAX_PHOTOS),
    videos: z.array(str(300)).max(MAX_VIDEOS),
  }),
  pending: z.array(z.enum(["coat", "breed", "lifeStage", "personalityTags"])),
  reviewRequested: z.boolean(),
  notice: z.enum(["not_cat", "inappropriate", "maybe_other_cat", "too_many_photos", "too_many_videos"]).nullable(),
});
