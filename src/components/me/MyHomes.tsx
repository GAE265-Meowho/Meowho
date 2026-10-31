"use client";
/* eslint-disable @next/next/no-img-element */
// 我的喵戶：喵戶與貓咪清單（資料由頁面讀取後傳進來）
import { VerificationApply, type VerificationRow } from "@/components/VerificationApply";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { LIFE_STAGE_LABEL, type LifeStage } from "@/lib/cat-profile/life-stage";
import { ageLabel } from "@/lib/onboarding/cat";
import { CARETAKER_LABEL, type CaretakerType } from "@/lib/onboarding/household";
import s from "./me.module.css";

export interface Household { id: string; name: string; caretaker_type: CaretakerType; city: string; district: string; intro: string; verified_shelter: boolean }
export interface CatRow {
  id: string; household_id: string; name: string; sex: string; birthday: string | null; est_age_months: number | null;
  life_stage: LifeStage | null; coat: string | null; breed: string | null; personality_tags: string[]; photo_url: string | null; status: string;
}

const STATUS_LABEL: Record<string, string> = { adoptable: "待領養", adopted: "已領養", own: "自家貓" };
const SEX_LABEL: Record<string, string> = { male: "男生", female: "女生" };

export function MyHomes({ homes, cats, verifs, onVerification }: {
  homes: Household[]; cats: CatRow[]; verifs: VerificationRow[]; onVerification: (row: VerificationRow) => void;
}) {
  return (
    <>
      {homes.map(home => {
        const list = cats.filter(c => c.household_id === home.id);
        return (
          <article key={home.id} className={s.home} aria-labelledby={`home-${home.id}`}>
            <section className={f.card}>
              <div className={s.badges}>
                <span className={s.kicker}><Icon name="house" size={16} />{CARETAKER_LABEL[home.caretaker_type]}</span>
                <VerificationApply householdId={home.id} verified={home.verified_shelter}
                  latest={verifs.find(v => v.household_id === home.id) ?? null}
                  onSubmitted={onVerification} />
              </div>
              <h2 id={`home-${home.id}`} className={s.homeName}>{home.name}</h2>
              <span className={s.place}><Icon name="pin" size={18} />{home.city}{home.district}</span>
              {home.intro && <p className={s.intro}>{home.intro}</p>}
            </section>

            <div className={s.secHead}>
              <h3>貓咪（{list.length}）</h3>
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
