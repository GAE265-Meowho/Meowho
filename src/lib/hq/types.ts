// MeowHQ｜喵星總部 — 共用約定（T-HQ-01）
// 依據：docs/hq/01 規格書 §3、§4.0、§4.6、§4.7；決策 003；GLOSSARY.md。
// 只放型別與常數，不放任何判斷邏輯（權限判斷在 permissions.ts、處置規則在 actions.ts，階段 1 實作）。
// 修改本檔等於修改介面：db、logic、shell 三條線都依賴這裡的名稱，請先在 Issue 協調。

/** 後台模組代號，也是授權的最小單位（GLOSSARY「後台模組」）。 */
export const ADMIN_MODULES = [
  "report_moderation", // 檢舉與內容審核
  "user_management", // 用戶權限管理
  "products", // 商品
  "knowledge", // 知識管理
  "virtual_assets", // 虛擬體驗元件管理
  "admin_authorization", // Admin 授權（僅系統管理員）
] as const;
export type AdminModule = (typeof ADMIN_MODULES)[number];

export const ADMIN_MODULE_LABELS: Record<AdminModule, string> = {
  report_moderation: "檢舉與內容審核",
  user_management: "用戶權限管理",
  products: "商品",
  knowledge: "知識管理",
  virtual_assets: "虛擬體驗元件管理",
  admin_authorization: "Admin 授權",
};

/** 只有系統管理員能使用、不可授予管理員的模組（UT-HQ-11）。 */
export const SYSTEM_ADMIN_ONLY_MODULES = ["admin_authorization"] as const satisfies readonly AdminModule[];

/** 可由系統管理員授予管理員的模組（順序同側欄）。 */
export const GRANTABLE_MODULES = ADMIN_MODULES.filter(
  (m) => !(SYSTEM_ADMIN_ONLY_MODULES as readonly AdminModule[]).includes(m)
);
export type GrantableModule = Exclude<AdminModule, (typeof SYSTEM_ADMIN_ONLY_MODULES)[number]>;

/** 側欄項目：首頁（待辦總覽）不是授權模組，所有登入的管理員都有。Admin 授權前有分隔線。 */
export type SidebarItem = "home" | AdminModule;
export const HQ_SIDEBAR_ORDER: readonly SidebarItem[] = ["home", ...ADMIN_MODULES];

/**
 * 角色（meow_profiles.role）。
 * 「貓友」「貓戶長」不是角色，而是由是否擁有貓戶推導出的身分；
 * 它們與 member 同屬被管理對象。
 */
export const HQ_ROLES = ["system_admin", "admin", "member"] as const;
export type HqRole = (typeof HQ_ROLES)[number];

/**
 * 需要填寫原因、並寫入稽核日誌的處置（規格書 §4.6）。
 * 授予類動作（grant_module、grant_badge、set_role）不是「處置」，只作為稽核日誌的 action（見 admin-moderation.md）。
 */
export const HQ_DISPOSITIONS = [
  "suspend", // 停權
  "unsuspend", // 解除停權
  "revoke_grant", // 撤銷模組授權
  "revoke_badge", // 撤銷中途徽章
  "takedown", // 下架內容／元件
  "relist", // 重新上架
  "ban", // 加入黑名單（僅系統管理員）
  "unban", // 移出黑名單（僅系統管理員；規格書 §4.6 要求同樣填原因）
] as const;
export type HqDisposition = (typeof HQ_DISPOSITIONS)[number];

export const DISPOSITION_LABELS: Record<HqDisposition, string> = {
  suspend: "停權",
  unsuspend: "解除停權",
  revoke_grant: "撤銷模組授權",
  revoke_badge: "撤銷中途徽章",
  takedown: "下架",
  relist: "重新上架",
  ban: "加入黑名單",
  unban: "移出黑名單",
};

/** 快選原因（規格書 §4.7）。規格書未列的處置為空清單，只填自由文字；各模組日後可再調整。 */
export const QUICK_REASONS: Record<HqDisposition, readonly string[]> = {
  suspend: ["疑似販售貓咪", "詐騙", "辱罵或騷擾", "不實資料", "其他"],
  unsuspend: [],
  revoke_grant: ["職務異動", "資料不符", "其他"],
  revoke_badge: ["職務異動", "資料不符", "其他"],
  takedown: ["非貓內容", "不當內容", "重複", "其他"],
  relist: [],
  ban: [],
  unban: [],
};

/** 後台操作的錯誤代碼；畫面只顯示白話說明，不顯示代碼（規格書 §4.7）。 */
export const HQ_ERROR_CODES = ["not_found", "permission_changed", "network"] as const;
export type HqErrorCode = (typeof HQ_ERROR_CODES)[number];
