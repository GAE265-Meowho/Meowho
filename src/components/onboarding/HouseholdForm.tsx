"use client";
// 建立喵戶：先選身分，表單依身分顯示不同欄位（#82）。規則在 lib/onboarding/household-rules.ts。
// 一般飼主的喵戶是「自己的家」；中途的喵戶是「送養據點」。建好後回到「我的喵戶」。
// 位置只公開到縣市＋區（AGENTS.md §6），所以沒有地址欄。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TW_CITIES, TW_DISTRICTS } from "@/lib/geo/tw-districts";
import {
  DWELLINGS, FAMILY, LIVING, PETS, ROLES, ROLE_INFO, checkHousehold, emptyHouseholdForm, toHouseholdRow, verificationRow,
  type HouseholdForm as Form, type MissingField,
} from "@/lib/onboarding/household-rules";
import { getBrowserSupabase } from "@/lib/supabase/client";
import CatButton from "../ui/CatButton";
import Required from "../ui/Required";
import { MultiPick, OnePick, TermsFields } from "./AdoptionFields";
import s from "./intake.module.css";

const MISSING_LABEL: Record<MissingField, string> = {
  role: "身分", name: "喵戶名稱", nameTaken: "不重複的喵戶名稱（你已經有同名的喵戶）", city: "縣市", district: "區", dwelling: "住家型態", orgName: "單位名稱", orgProofUrl: "立案證明連結（網址）",
};

export function HouseholdForm({ userId, existingNames, onDemoCreated }: {
  userId: string | null;
  /** 這個帳號已有的喵戶名稱；名稱不能重複 */
  existingNames: string[];
  onDemoCreated: (name: string, role: Form["role"]) => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<Form>(emptyHouseholdForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Form>) => setF(v => ({ ...v, ...patch }));
  const setHome = (patch: Partial<Form["home"]>) => setF(v => ({ ...v, home: { ...v.home, ...patch } }));

  const missing = checkHousehold(f, existingNames);
  const owner = f.role === "cat_owner";
  const foster = f.role === "personal_foster" || f.role === "shelter_org";

  async function create() {
    setTried(true);
    if (missing.length) return;
    setError(null); setSaving(true);
    const row = toHouseholdRow(f);
    const sb = getBrowserSupabase();
    if (!sb || !userId) { setSaving(false); onDemoCreated(row.name, f.role); return; }
    const { data, error: err } = await sb.from("meow_households").insert({ ...row, owner_id: userId }).select("id").single();
    if (err) {
      setSaving(false);
      setError(err.message.includes("household_limit") ? "已經達到喵戶數量上限，請到「我的喵戶」管理。"
        : err.message.includes("household_name_taken") ? "你已經有同名的喵戶，換個名字吧。" : `儲存失敗：${err.message}`);
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
        <span className={s.label} id="h-role">你的身分<Required /></span>
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
            <label className={s.label} htmlFor="h-name">喵戶名稱<Required /></label>
            <input id="h-name" value={f.name} maxLength={30} placeholder={owner ? "例如：子哲的家" : "例如：小橘之家"} onChange={e => set({ name: e.target.value })} />
          </div>
          <div className={s.pair}>
            <div className={s.field}>
              <label className={s.label} htmlFor="h-city">縣市<Required /></label>
              {/* 換縣市時清空已選的區，避免縣市和區對不上 */}
              <select id="h-city" value={f.city ?? ""} onChange={e => set({ city: e.target.value, district: "" })}>
                <option value="" disabled>請選擇</option>
                {TW_CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="h-dist">區<Required /></label>
              <select id="h-dist" value={f.district} disabled={!f.city} onChange={e => set({ district: e.target.value })}>
                <option value="" disabled>{f.city ? "請選擇" : "先選縣市"}</option>
                {(f.city ? TW_DISTRICTS[f.city] ?? [] : []).map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {owner && (
        <>
          <div className={s.field}>
            <span className={s.label}>住家型態<Required /></span>
            <OnePick label="住家型態" options={DWELLINGS} value={f.home.dwelling} onChange={v => setHome({ dwelling: v })} />
            {f.home.dwelling === "other" && (
              <input aria-label="其他住家型態" value={f.home.dwellingOther} maxLength={30} placeholder="請說明，例如：套房、鐵皮屋" onChange={e => setHome({ dwellingOther: e.target.value })} />
            )}
          </div>
          <div className={s.field}>
            <span className={s.label}>住家狀況</span>
            <OnePick label="住家狀況" options={LIVING} value={f.home.living} onChange={v => setHome({ living: v })} />
          </div>
          <div className={s.field}>
            <span className={s.label}>同住的人</span>
            <MultiPick label="同住的人" options={FAMILY} value={f.home.family} onChange={v => setHome({ family: v })} />
            {f.home.family.includes("其他") && (
              <input aria-label="其他同住的人" value={f.home.familyOther} maxLength={30} placeholder="請說明" onChange={e => setHome({ familyOther: e.target.value })} />
            )}
          </div>
          <div className={s.field}>
            <span className={s.label}>家裡現有的寵物</span>
            <MultiPick label="家裡現有的寵物" options={PETS} value={f.home.pets} onChange={v => setHome({ pets: v })} />
            {f.home.pets.includes("其他動物") && (
              <input aria-label="其他動物" value={f.home.petsOther} maxLength={30} placeholder="例如：兔子、鸚鵡" onChange={e => setHome({ petsOther: e.target.value })} />
            )}
          </div>
        </>
      )}

      {f.role === "shelter_org" && (
        <div className={s.pair}>
          <div className={s.field}>
            <label className={s.label} htmlFor="h-org">單位名稱<Required /></label>
            <input id="h-org" value={f.orgName} maxLength={60} onChange={e => set({ orgName: e.target.value })} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="h-proof">立案證明連結<Required /></label>
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
