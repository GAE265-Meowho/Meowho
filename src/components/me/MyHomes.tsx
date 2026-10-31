"use client";
/* eslint-disable @next/next/no-img-element */
// 我的喵戶：喵戶與貓咪清單（資料由頁面讀取後傳進來）。
// 依身分顯示不同入口（#82）：一般飼主是「自己的家」→ 3D 環境、居家安全檢測；中途是「送養據點」→ 待領養貓、中途徽章。
import { VerificationApply, type VerificationRow } from "@/components/VerificationApply";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { LIFE_STAGE_LABEL, type LifeStage } from "@/lib/cat-profile/life-stage";
import { ageLabel } from "@/lib/onboarding/cat";
import { useState } from "react";
import type { CaretakerType } from "@/lib/onboarding/household";
import { DWELLINGS, ROLE_INFO, SCREENS, type Home } from "@/lib/onboarding/household-rules";
import s from "./me.module.css";

export interface Household {
  id: string; name: string; caretaker_type: CaretakerType; city: string; district: string; intro: string; verified_shelter: boolean; home: Home | null;
}
export interface CatRow {
  id: string; household_id: string; name: string; sex: string; birthday: string | null; est_age_months: number | null;
  life_stage: LifeStage | null; coat: string | null; breed: string | null; personality_tags: string[]; photo_url: string | null; status: string;
}

const STATUS_LABEL: Record<string, string> = { adoptable: "待領養", adopted: "已領養", own: "自家貓" };
const SEX_LABEL: Record<string, string> = { male: "男生", female: "女生" };

function homeSummary(h: Home | null): string {
  if (!h) return "";
  return [
    h.dwelling && DWELLINGS[h.dwelling],
    h.renting ? (h.landlordOk ? "租屋（房東同意）" : "租屋") : null,
    h.family.length ? `同住：${h.family.join("、")}` : null,
    h.pets.length ? `家裡有${h.pets.join("、")}` : null,
    h.screens && `防護網${SCREENS[h.screens]}`,
  ].filter(Boolean).join("・");
}

function CatActions({ cat, onDelete }: { cat: CatRow; onDelete: (id: string) => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (asking) {
    return (
      <div className={s.catActions}>
        <span className={s.confirmText}>確定刪除{cat.name}？照片和影片也會一起刪除。</span>
        <button type="button" className={s.textBtn} disabled={busy} onClick={async () => { setBusy(true); await onDelete(cat.id); setBusy(false); setAsking(false); }}>{busy ? "刪除中…" : "確定刪除"}</button>
        <button type="button" className={s.textBtn} disabled={busy} onClick={() => setAsking(false)}>取消</button>
      </div>
    );
  }
  return (
    <div className={s.catActions}>
      <a className={s.textBtn} href={`/cats/${cat.id}/edit`}>修改</a>
      <button type="button" className={s.textBtn} onClick={() => setAsking(true)}>刪除</button>
    </div>
  );
}

export function MyHomes({ homes, cats, verifs, onVerification, onDeleteCat }: {
  homes: Household[]; cats: CatRow[]; verifs: VerificationRow[]; onVerification: (row: VerificationRow) => void; onDeleteCat: (id: string) => Promise<void>;
}) {
  return (
    <>
      {homes.map(home => {
        const list = cats.filter(c => c.household_id === home.id);
        const owner = home.caretaker_type === "cat_owner";
        return (
          <article key={home.id} className={s.home} aria-labelledby={`home-${home.id}`}>
            <section className={f.card}>
              <div className={s.badges}>
                <span className={s.kicker}><Icon name="house" size={16} />{ROLE_INFO[home.caretaker_type].label}</span>
                {!owner && (
                  <VerificationApply householdId={home.id} verified={home.verified_shelter}
                    latest={verifs.find(v => v.household_id === home.id) ?? null}
                    onSubmitted={onVerification} />
                )}
              </div>
              <h2 id={`home-${home.id}`} className={s.homeName}>{home.name}</h2>
              <span className={s.place}><Icon name="pin" size={18} />{home.city}{home.district}</span>
              {owner ? homeSummary(home.home) && <p className={s.intro}>{homeSummary(home.home)}</p> : home.intro && <p className={s.intro}>{home.intro}</p>}
              {/* 3D 環境接 #60（錄影轉空間）、#61（照片轉空間）；居家安全檢測接 #62（環境安全報告）。完成前先開說明頁。
                  只給一般飼主（準備領養的人看自己的家，決策 007） */}
              {owner && (
                <div className={s.tools}>
                  <CatButton size="sm" ears={false} href={`/homes/${home.id}/scene`}><Icon name="scan" size={18} />生成 3D 環境</CatButton>
                  <CatButton variant="ghost" size="sm" ears={false} href={`/homes/${home.id}/safety`}><Icon name="check" size={18} />居家安全檢測</CatButton>
                </div>
              )}
            </section>

            <div className={s.secHead}>
              <h3>{owner ? "我的貓" : "待領養的貓"}（{list.length}）</h3>
              <CatButton size="sm" href={`/onboarding?household=${home.id}`}>新增貓咪</CatButton>
            </div>
            {list.length === 0 ? <p className={f.lead}>還沒有貓，按「新增貓咪」開始吧。</p> : (
              <ul className={s.cats}>
                {list.map(c => (
                  <li key={c.id} className={s.cat}>
                    <div className={s.photo}>
                      {c.photo_url ? <img src={c.photo_url} alt={`${c.name}的照片`} /> : <Icon name="cat" size={64} />}
                    </div>
                    <h4 className={s.catName}>{c.name}</h4>
                    <p className={s.meta}>
                      {[SEX_LABEL[c.sex], c.life_stage ? LIFE_STAGE_LABEL[c.life_stage] : ageLabel({ birthday: c.birthday, estAgeMonths: c.est_age_months }), c.coat, c.breed].filter(Boolean).join("・")}
                    </p>
                    <div className={s.tags}>
                      <span className={`${s.tag} ${s.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                      {(c.personality_tags ?? []).map(t => <span key={t} className={s.tag}>{t}</span>)}
                    </div>
                    <CatActions cat={c} onDelete={onDeleteCat} />
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </>
  );
}
