"use client";
// 建立喵戶：欄位不多，直接用表單（子哲 2026-10-31，取代對話建立）。建好後回到「我的喵戶」，再從那裡新增貓。
// 位置只公開到縣市＋區（AGENTS.md §6、FR-02-07），所以沒有地址欄；預設接受私訊、公開（toHouseholdInsert）。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CITIES } from "@/lib/match";
import { CARETAKER_LABEL, cleanName, parseDistrict, type CaretakerType } from "@/lib/onboarding/household";
import { toHouseholdInsert } from "@/lib/onboarding/intake-rows";
import type { HouseholdFields } from "@/lib/onboarding/conversation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import CatButton from "../ui/CatButton";
import s from "./intake.module.css";

export function HouseholdForm({ userId, onDemoCreated }: { userId: string | null; onDemoCreated: (name: string) => void }) {
  const router = useRouter();
  const [h, setH] = useState<HouseholdFields>({ caretakerType: null, name: "", city: null, district: null, intro: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<HouseholdFields>) => setH(v => ({ ...v, ...patch }));

  // 寫「北屯區」或只寫「北屯」都可以
  const typed = h.district?.trim() ?? "";
  const district = h.city && typed ? parseDistrict(`${h.city}${typed}`, h.city) ?? (typed.length >= 2 ? typed : null) : null;
  const ready = Boolean(h.caretakerType && cleanName(h.name).length >= 2 && h.city && district);

  async function create() {
    if (!ready) return;
    setError(null); setSaving(true);
    const row = toHouseholdInsert({ ...h, name: cleanName(h.name), district });
    const sb = getBrowserSupabase();
    if (!sb || !userId) { setSaving(false); onDemoCreated(row.name); return; }
    const { error: err } = await sb.from("meow_households").insert({ ...row, owner_id: userId });
    if (err) {
      setSaving(false);
      setError(err.message.includes("household_limit") ? "每個帳號最多建立 2 個喵戶，請到「我的喵戶」管理。" : `儲存失敗：${err.message}`);
      return;
    }
    router.push("/me");
  }

  return (
    <form className={s.card} aria-labelledby="household-form" onSubmit={e => { e.preventDefault(); create(); }}>
      <h2 id="household-form">喵戶資料</h2>
      <div className={s.field}>
        <span className={s.label} id="h-type">你的身分</span>
        <div className={s.chips} role="radiogroup" aria-labelledby="h-type">
          {(Object.entries(CARETAKER_LABEL) as [CaretakerType, string][]).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={h.caretakerType === v} className={s.chip} onClick={() => set({ caretakerType: v })}>{l}</button>
          ))}
        </div>
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor="h-name">喵戶名稱</label>
        <input id="h-name" value={h.name} maxLength={30} placeholder="例如：小橘之家" onChange={e => set({ name: e.target.value })} />
      </div>
      <div className={s.pair}>
        <div className={s.field}>
          <label className={s.label} htmlFor="h-city">縣市</label>
          <select id="h-city" value={h.city ?? ""} onChange={e => set({ city: e.target.value })}>
            <option value="" disabled>請選擇</option>
            {CITIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="h-dist">區</label>
          <input id="h-dist" value={h.district ?? ""} maxLength={6} placeholder="例如：北屯區" onChange={e => set({ district: e.target.value })} />
        </div>
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor="h-intro">介紹喵戶</label>
        <textarea id="h-intro" rows={3} value={h.intro} maxLength={500} onChange={e => set({ intro: e.target.value })} />
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}>
        <CatButton type="submit" disabled={saving || !ready}>{saving ? "建立中…" : "建立喵戶"}</CatButton>
      </div>
    </form>
  );
}
