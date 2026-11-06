"use client";
/* eslint-disable @next/next/no-img-element */
// 我的喵戶：喵戶與貓咪清單（資料由頁面讀取後傳進來）。
// 改版（子哲 2026-11-04）：每個喵戶一個區塊（頭像、名稱、地區、介紹、右上角修改），下方用分頁切換貓的類型（規則在 lib/my-homes.ts）。
//   中途：「領養管理」「新增貓咪」＋分頁「待領養貓／還在準備」；一般飼主：「生成 3D 環境」「居家安全檢測」＋分頁「我的貓／收藏貓」。
//   貓卡片只留修改圖示；刪除喵戶、刪除貓咪移到各自修改頁的最下方。
import { useState } from "react";
import { VerificationApply, type VerificationRow } from "@/components/VerificationApply";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import type { LifeStage } from "@/lib/cat-profile/life-stage";
import { homeTools, type HomeTool, type ReportRow, type RoomRow } from "@/lib/home-room";
import { catsForTab, homeAvatar, tabsFor, type HomeTab } from "@/lib/my-homes";
import type { CaretakerType } from "@/lib/onboarding/household";
import { ALONE, DWELLINGS, EXPERIENCE, LIVING, NO_PETS, ROLE_INFO, emptyHouseholdForm, type Home } from "@/lib/onboarding/household-rules";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { photoSrc } from "@/lib/supabase/config";
import s from "./me.module.css";

export interface Household {
  id: string; name: string; caretaker_type: CaretakerType; city: string; district: string; intro: string; verified_shelter: boolean; home: Home | null;
  avatar_path?: string | null;
}
export interface CatRow {
  id: string; household_id: string; origin_household_id: string | null; name: string; sex: string;
  life_stage: LifeStage | null; coat: string | null; breed: string | null; personality_tags: string[]; photo_url: string | null; status: string;
}
/** 收藏貓分頁用（一般飼主），收藏屬於帳號，每個一般飼主喵戶都顯示同一份 */
export interface FavCat { id: string; name: string; photo_url: string | null }

/** 喵戶卡片上每個喵戶的 3D 房間與環境報告（只讀狀態，判斷在 lib/home-room.ts 的 homeTools） */
export type HomeRoomRow = RoomRow & { owner_household_id: string };
export type HomeReportRow = Pick<ReportRow, "status"> & { household_id: string };

const EDIT_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/** 處理中的按鈕停用、不能點；其他狀態連到對應頁面 */
function ToolButton({ tool, href, icon, variant }: { tool: HomeTool; href: string; icon: "scan" | "check"; variant: "primary" | "ghost" }) {
  const inner = <><Icon name={icon} size={18} />{tool.label}</>;
  return tool.state === "busy"
    ? <CatButton variant={variant} size="sm" ears={false} disabled>{inner}</CatButton>
    : <CatButton variant={variant} size="sm" ears={false} href={href}>{inner}</CatButton>;
}

/** 舊資料可能缺欄位（#82 早期格式），一律補預設值再顯示 */
function homeSummary(raw: Partial<Home> | null): string {
  if (!raw) return "";
  const h: Home = { ...emptyHouseholdForm().home, ...raw };
  return [
    h.dwelling === "other" ? h.dwellingOther || DWELLINGS.other : h.dwelling && DWELLINGS[h.dwelling],
    h.living && LIVING[h.living],
    h.family.includes(ALONE) ? ALONE : h.family.length ? `同住：${h.family.map(f => (f === "其他" && h.familyOther ? h.familyOther : f)).join("、")}` : null,
    h.pets.includes(NO_PETS) ? "沒有其他寵物" : h.pets.length ? `家裡有${h.pets.map(p => (p === "其他動物" && h.petsOther ? h.petsOther : p)).join("、")}` : null,
    h.experience && EXPERIENCE[h.experience],
  ].filter(Boolean).join("・");
}

const EMPTY: Record<HomeTab, string> = {
  adoptable: "還沒有出發找新主人的貓。",
  preparing: "沒有還在準備的貓，按「新增貓咪」開始吧。",
  mine: "從中途領養的貓，領養完成後會出現在這裡。",
  favorites: "還沒有收藏的貓，在貓咪頁按「收藏」就會出現在這裡。",
};

/** 貓卡片：整張連到貓咪頁，右下角的修改圖示連到修改頁（收藏的貓不是自己的，沒有修改） */
function CatCard({ cat, editable }: { cat: { id: string; name: string; photo_url: string | null }; editable: boolean }) {
  return (
    <li className={s.catCard}>
      <a className={s.catCover} href={`/cats/${cat.id}`}>
        {cat.photo_url ? <img src={cat.photo_url} alt="" /> : <Icon name="cat" size={56} />}
        <span className={s.catLabel}>{cat.name}</span>
      </a>
      {editable && <a className={s.catEdit} href={`/cats/${cat.id}/edit`} aria-label={`修改${cat.name}`}>{EDIT_ICON}</a>}
    </li>
  );
}

function HomeSection({ home, cats, favorites, verifs, tools, googleAvatar, onVerification }: {
  home: Household; cats: CatRow[]; favorites: FavCat[]; verifs: VerificationRow[]; tools: ReturnType<typeof homeTools>;
  googleAvatar: string | null; onVerification: (row: VerificationRow) => void;
}) {
  const owner = home.caretaker_type === "cat_owner";
  const tabs = tabsFor(home.caretaker_type);
  const [tab, setTab] = useState<HomeTab>(tabs[0].key);
  const sb = getBrowserSupabase();
  const avatar = sb ? homeAvatar(home.avatar_path, googleAvatar, p => photoSrc(sb, p)) : googleAvatar;
  const count = (k: HomeTab) => (k === "favorites" ? favorites.length : catsForTab(cats, k).length);
  const list = tab === "favorites" ? favorites : catsForTab(cats, tab);

  return (
    <section className={s.homeSection} aria-labelledby={`home-${home.id}`}>
      <div className={s.homeHead}>
        <span className={s.homeAvatar}>{avatar ? <img src={avatar} alt="" /> : <Icon name="house" size={36} />}</span>
        <div className={s.homeText}>
          <div className={s.badges}>
            <span className={s.kicker}><Icon name={owner ? "house" : "paw"} size={16} />{ROLE_INFO[home.caretaker_type].label}</span>
            {!owner && (
              <VerificationApply householdId={home.id} verified={home.verified_shelter}
                latest={verifs.find(v => v.household_id === home.id) ?? null} onSubmitted={onVerification} />
            )}
          </div>
          <h2 id={`home-${home.id}`} className={s.homeName}>{home.name}</h2>
          <span className={s.place}><Icon name="pin" size={18} />{home.city}{home.district}</span>
          {owner ? homeSummary(home.home) && <p className={s.intro}>{homeSummary(home.home)}</p> : home.intro && <p className={s.intro}>{home.intro}</p>}
        </div>
        <a className={s.homeEdit} href={`/homes/${home.id}/edit`} aria-label={`修改「${home.name}」`}>{EDIT_ICON}</a>
      </div>

      <div className={s.tools}>
        {owner ? (
          <>
            {/* 兩顆按鈕依規格 09 §7.2 狀態表切換；建模中兩顆一起停用（決策 007：只給一般飼主看自己的家） */}
            <ToolButton tool={tools.scene} href={`/homes/${home.id}/scene`} icon="scan" variant="primary" />
            <ToolButton tool={tools.safety} href={`/homes/${home.id}/safety`} icon="check" variant="ghost" />
          </>
        ) : (
          <>
            <CatButton variant="ghost" size="sm" ears={false} href="/me/adoptions"><Icon name="comment" size={18} />領養管理</CatButton>
            {/* 只有中途能新增貓；一般飼主的貓只會從中途移轉過來（#109） */}
            <CatButton size="sm" href={`/onboarding?household=${home.id}`}><Icon name="plus" size={18} />新增貓咪</CatButton>
          </>
        )}
      </div>

      <div className={s.tabs} role="tablist" aria-label={`${home.name}的貓`}>
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={s.tab} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} size={18} />{t.label}<span className={s.tabCount}>{count(t.key)}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {list.length === 0 ? <p className={f.lead}>{EMPTY[tab]}</p> : (
          <ul className={s.catGrid}>
            {list.map(c => <CatCard key={c.id} cat={c} editable={tab !== "favorites"} />)}
          </ul>
        )}
      </div>
    </section>
  );
}

export function MyHomes({ homes, cats, favorites = [], verifs, rooms = [], reports = [], googleAvatar = null, onVerification }: {
  homes: Household[]; cats: CatRow[]; favorites?: FavCat[]; verifs: VerificationRow[]; rooms?: HomeRoomRow[]; reports?: HomeReportRow[];
  googleAvatar?: string | null; onVerification: (row: VerificationRow) => void;
}) {
  return (
    <>
      {homes.map(home => (
        <HomeSection key={home.id} home={home} cats={cats.filter(c => c.household_id === home.id)} favorites={favorites} verifs={verifs}
          tools={homeTools(rooms.filter(r => r.owner_household_id === home.id), reports.filter(r => r.household_id === home.id))}
          googleAvatar={googleAvatar} onVerification={onVerification} />
      ))}
    </>
  );
}
