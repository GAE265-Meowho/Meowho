// 中途喵戶總覽頁 /households/[id]（#354）：任何人都能看的喵戶名片＋這個喵戶正在等家的貓。
// 只讀公開欄位：名稱、類型、縣市＋區（FR-02-07）、介紹、頭像。喵戶長是誰、住家狀況（home）、預算都不讀。
// 一般飼主的喵戶不開放這一頁（決策 007：飼主的家只給自己看），當作找不到。
import { FOSTER_LABEL } from "./adopt-feed";

/** 只選公開欄位；不要加 owner_id、home、adoption_terms */
export const HOUSEHOLD_PUBLIC_SELECT = "id, name, caretaker_type, city, district, intro, avatar_path, verified_shelter";

export interface HouseholdPublicRow {
  id: string; name: string; caretaker_type: string; city: string | null; district: string | null;
  intro: string | null; avatar_path: string | null; verified_shelter: boolean | null;
}

export interface PublicHome {
  id: string; name: string; kind: string; place: string; intro: string; avatarPath: string | null; verified: boolean;
}

/** 資料列轉成畫面用的喵戶；不是中途（或讀不到）回傳 null，畫面顯示找不到 */
export function toPublicHome(row: HouseholdPublicRow | null | undefined): PublicHome | null {
  if (!row) return null;
  const kind = FOSTER_LABEL[row.caretaker_type];
  if (!kind) return null;
  return {
    id: row.id,
    name: row.name,
    kind,
    place: `${(row.city ?? "").replace(/臺/g, "台")}${row.district ?? ""}`,
    intro: (row.intro ?? "").trim(),
    avatarPath: row.avatar_path || null,
    verified: Boolean(row.verified_shelter),
  };
}

/** 中途才有總覽頁可以連 */
export const hasHouseholdPage = (caretakerType: string | null | undefined) => Boolean(caretakerType && FOSTER_LABEL[caretakerType]);
