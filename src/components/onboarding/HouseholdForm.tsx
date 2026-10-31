"use client";
// 建立喵戶：先選身分，表單依身分顯示不同欄位（#82）。規則在 lib/onboarding/household-rules.ts。
// 一般飼主的喵戶是「自己的家」；中途的喵戶是「送養據點」。建好後回到「我的喵戶」。
// 位置只公開到縣市＋區（AGENTS.md §6），所以沒有地址欄。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CITIES } from "@/lib/match";
import {
  DWELLINGS, FAMILY, PETS, ROLES, ROLE_INFO, SCREENS, checkHousehold, emptyHouseholdForm, toHouseholdRow, verificationRow,
  type HouseholdForm as Form, type MissingField,
} from "@/lib/onboarding/household-rules";
import { getBrowserSupabase } from "@/lib/supabase/client";
import CatButton from "../ui/CatButton";
import { MultiPick, OnePick, TermsFields } from "./AdoptionFields";
import s from "./intake.module.css";

const MISSING_LABEL: Record<MissingField, string> = {
  role: "身分", name: "喵戶名稱", city: "縣市", district: "區", dwelling: "住家型態", orgName: "單位名稱", orgProofUrl: "立案證明連結（網址）",
};
const YES_NO = { yes: "是", no: "否" } as const;
const yn = (v: boolean | null) => (v === null ? null : v ? "yes" : "no");

export function HouseholdForm({ userId, displayName, onDemoCreated }: {
  userId: string | null; displayName: string | null; onDemoCreated: (name: string, role: Form["role"]) => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<Form>(emptyHouseholdForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Form>) => setF(v => ({ ...v, ...patch }));
  const setHome = (patch: Partial<Form["home"]>) => setF(v => ({ ...v, home: { ...v.home, ...patch } }));

  const missing = checkHousehold(f);
  const owner = f.role === "cat_owner";
  const foster = f.role === "personal_foster" || f.role === "shelter_org";

  async function create() {
    setTried(true);
    if (missing.length) return;
    setError(null); setSaving(true);
    const row = toHouseholdRow(f, displayName);
    const sb = getBrowserSupabase();
    if (!sb || !userId) { setSaving(false); onDemoCreated(row.name, f.role); return; }
    const { data, error: err } = await sb.from("meow_households").insert({ ...row, owner_id: userId }).select("id").single();
    if (err) {
      setSaving(false);
      setError(err.message.includes("household_limit") ? "已經達到喵戶數量上限，請到「我的喵戶」管理。" : `儲存失敗：${err.message}`);
      return;
    }
    const v = verificationRow(f, { householdId: data.id, userId });
    // 徽章申請失敗不擋建立喵戶：之後可以在「我的喵戶」重新申請
    if (v) await sb.from("meow_shelter_verifications").insert(v);
    router.push("/me");
  }

  return (
    <form className={s.card} aria-labelledby="household-form" onSubmit={e => { e.preventDefault(); create(); }}>
      <h2 id="household-form">喵戶資料</h2>

      <div className={s.field}>
        <span className={s.label} id="h-role">你的身分</span>
        <div className={s.roles} role="radiogroup" aria-labelledby="h-role">
          {ROLES.map(r => (
            <button key={r} type="button" role="radio" aria-checked={f.role === r} className={s.role} onClick={() => set({ role: r })}>
              <b>{ROLE_INFO[r].label}</b><span>{ROLE_INFO[r].hint}</span>
            </button>
          ))}
        </div>
      </div>

      {f.role && (
        <>
          <div className={s.field}>
            <label className={s.label} htmlFor="h-name">{owner ? "喵戶名稱（可以不填）" : "喵戶名稱"}</label>
            <input id="h-name" value={f.name} maxLength={30} placeholder={owner ? "不填就叫「我的家」" : "例如：小橘之家"} onChange={e => set({ name: e.target.value })} />
          </div>
          <div className={s.pair}>
            <div className={s.field}>
              <label className={s.label} htmlFor="h-city">縣市</label>
              <select id="h-city" value={f.city ?? ""} onChange={e => set({ city: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="h-dist">區</label>
              <input id="h-dist" value={f.district} maxLength={6} placeholder="例如：北屯區" onChange={e => set({ district: e.target.value })} />
            </div>
          </div>
        </>
      )}

      {owner && (
        <>
          <div className={s.field}>
            <span className={s.label}>住家型態</span>
            <OnePick label="住家型態" options={DWELLINGS} value={f.home.dwelling} onChange={v => setHome({ dwelling: v })} />
          </div>
          <div className={s.field}>
            <span className={s.label}>是租屋嗎</span>
            <OnePick label="是租屋嗎" options={YES_NO} value={yn(f.home.renting)} onChange={v => setHome({ renting: v === "yes", landlordOk: v === "yes" ? f.home.landlordOk : null })} />
          </div>
          {f.home.renting && (
            <div className={s.field}>
              <span className={s.label}>房東同意養貓嗎</span>
              <OnePick label="房東同意養貓嗎" options={YES_NO} value={yn(f.home.landlordOk)} onChange={v => setHome({ landlordOk: v === "yes" })} />
            </div>
          )}
          <div className={s.field}>
            <span className={s.label}>同住的家人</span>
            <MultiPick label="同住的家人" options={FAMILY} value={f.home.family} onChange={v => setHome({ family: v })} />
          </div>
          <div className={s.field}>
            <span className={s.label}>家裡現有的寵物</span>
            <MultiPick label="家裡現有的寵物" options={PETS} value={f.home.pets} onChange={v => setHome({ pets: v })} />
          </div>
          <div className={s.field}>
            <span className={s.label}>窗戶與陽台防護網</span>
            <OnePick label="窗戶與陽台防護網" options={SCREENS} value={f.home.screens} onChange={v => setHome({ screens: v })} />
          </div>
        </>
      )}

      {f.role === "shelter_org" && (
        <div className={s.pair}>
          <div className={s.field}>
            <label className={s.label} htmlFor="h-org">單位名稱</label>
            <input id="h-org" value={f.orgName} maxLength={60} onChange={e => set({ orgName: e.target.value })} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="h-proof">立案證明連結</label>
            <input id="h-proof" type="url" inputMode="url" placeholder="https://" value={f.orgProofUrl} onChange={e => set({ orgProofUrl: e.target.value })} />
          </div>
        </div>
      )}

      {foster && (
        <>
          <div className={s.field}>
            <label className={s.label} htmlFor="h-intro">介紹喵戶</label>
            <textarea id="h-intro" rows={3} value={f.intro} maxLength={500} onChange={e => set({ intro: e.target.value })} />
          </div>
          <div className={s.field}>
            <span className={s.label}>預設送養條件</span>
            <TermsFields id="h-terms" value={f.terms ?? { items: [], note: "" }} onChange={terms => set({ terms })} />
          </div>
          {f.role === "personal_foster" && (
            <label className={s.check}>
              <input type="checkbox" checked={f.applyBadge} onChange={e => set({ applyBadge: e.target.checked })} />
              同時申請中途徽章
            </label>
          )}
        </>
      )}

      {tried && missing.length > 0 && <p className={s.error} role="alert">還缺：{missing.map(m => MISSING_LABEL[m]).join("、")}</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}>
        <CatButton type="submit" disabled={saving}>{saving ? "建立中…" : "建立喵戶"}</CatButton>
      </div>
    </form>
  );
}
