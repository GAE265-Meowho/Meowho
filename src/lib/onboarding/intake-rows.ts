// 建檔對話草稿 → 資料表欄位（#72），以及檢查瀏覽器送來的草稿。
// 新建的喵戶預設接受私訊、公開；新建的貓公開，狀態依喵戶身分（一般飼主是自家貓、中途是待領養）。
import { z } from "zod";
import { HEALTH_TAGS, PERSONALITY_TAGS } from "../cat-profile/tags";
import { AdoptionTermsSchema, CompatSchema, HABITS, HANDOVER_ITEMS, MedicalSchema } from "../cat-profile/adoption";
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
    neutered: c.medical.neutered === "unknown" ? (c.healthTags.includes("已結紮") ? true : null) : c.medical.neutered === "done",
    description: c.description,
    timeline: c.timeline,
    medical: c.medical,
    compat: c.compat,
    habits: c.habits,
    // null＝沿用喵戶的預設送養條件
    adoption_terms: c.adoptionTerms,
    handover: c.handover,
    photo_paths: c.photos,
    // 舊欄位 photo_url 放封面網址，給既有畫面相容；新程式讀 photo_paths
    photo_url: ids.coverUrl,
    status: c.status,
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
    medical: MedicalSchema,
    compat: CompatSchema,
    habits: z.array(z.enum(HABITS)).max(HABITS.length),
    adoptionTerms: AdoptionTermsSchema.nullable(),
    handover: z.array(z.enum(HANDOVER_ITEMS)).max(HANDOVER_ITEMS.length),
    status: z.enum(["own", "adoptable"]),
    photos: z.array(str(300)).max(MAX_PHOTOS),
    videos: z.array(str(300)).max(MAX_VIDEOS),
  }),
  pending: z.array(z.enum(["coat", "breed", "lifeStage", "personalityTags", "sex", "health"])),
  reviewRequested: z.boolean(),
  notice: z.enum(["not_cat", "inappropriate", "maybe_other_cat", "too_many_photos", "too_many_videos"]).nullable(),
});
