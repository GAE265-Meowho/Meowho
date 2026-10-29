import { describe, it, expect } from "vitest";
import { HQ_DISPOSITIONS, QUICK_REASONS } from "./types";
import {
  UNSUSPEND_NOTICE,
  checkNotAlreadySuspended,
  composeReason,
  confirmBanEmail,
  formatTaipeiDate,
  getImpactMessage,
  getQuickReasons,
  isSuspended,
  resolveSuspendUntil,
  validateReason,
  validateSuspendUntil,
} from "./actions";

// T-HQ-04｜UT-HQ-17～28（docs/hq/02 §4.3）＋規格書 R10、R11。
// 「今天」固定為 2026-10-28（Asia/Taipei）。
const NOW = new Date("2026-10-28T10:00:00+08:00");

describe("原因必填（UT-HQ-17～19）", () => {
  it("UT-HQ-17 停權：空字串、空白、全形空白、換行 → 請填寫原因", () => {
    for (const r of ["", "   ", "\u3000\u3000", " \n\t "]) {
      expect(validateReason("suspend", r)).toEqual({ ok: false, message: "請填寫原因" });
    }
  });
  it("UT-HQ-18 解除停權：原因空白 → 請填寫原因", () => {
    expect(validateReason("unsuspend", "  ")).toEqual({ ok: false, message: "請填寫原因" });
  });
  it("UT-HQ-19 撤銷授權、撤銷徽章、下架、重新上架、黑名單、移出黑名單：空白皆失敗", () => {
    for (const d of HQ_DISPOSITIONS) {
      expect(validateReason(d, " ").ok).toBe(false);
    }
  });
  it("有內容時通過，並回傳去除前後空白的原因", () => {
    expect(validateReason("suspend", "  詐騙  ")).toEqual({ ok: true, reason: "詐騙" });
  });
  it("未填（undefined／null）視為空", () => {
    expect(validateReason("ban", undefined).ok).toBe(false);
    expect(validateReason("ban", null).ok).toBe(false);
  });
});

describe("停權期限與到期（UT-HQ-20、21，R10）", () => {
  it("UT-HQ-20 7 天／30 天／直到手動解除 → 2026-11-04／2026-11-27／無", () => {
    expect(formatTaipeiDate(resolveSuspendUntil("7d", NOW)!)).toBe("2026-11-04");
    expect(formatTaipeiDate(resolveSuspendUntil("30d", NOW)!)).toBe("2026-11-27");
    expect(resolveSuspendUntil("manual", NOW)).toBeNull();
  });
  it("UT-HQ-21 到期日 2026-10-27 → isSuspended＝false", () => {
    expect(isSuspended({ until: "2026-10-27" }, NOW)).toBe(false);
  });
  it("未到期、直到手動解除 → 停權中；無停權紀錄 → 否", () => {
    expect(isSuspended({ until: "2026-11-04" }, NOW)).toBe(true);
    expect(isSuspended({ until: null }, NOW)).toBe(true);
    expect(isSuspended(null, NOW)).toBe(false);
    expect(isSuspended(undefined, NOW)).toBe(false);
  });
  it("已解除的停權不算停權中", () => {
    expect(isSuspended({ until: null, liftedAt: "2026-10-27T00:00:00+08:00" }, NOW)).toBe(false);
  });
  it("到期時間剛好等於現在 → 已到期", () => {
    expect(isSuspended({ until: NOW }, NOW)).toBe(false);
  });
  it("R10 期限必須是未來；直到手動解除不受限", () => {
    expect(validateSuspendUntil(null, NOW)).toEqual({ ok: true });
    expect(validateSuspendUntil("2026-11-04", NOW)).toEqual({ ok: true });
    expect(validateSuspendUntil(NOW, NOW)).toEqual({ ok: false, message: "停權期限必須是未來的時間" });
    expect(validateSuspendUntil("2026-10-27", NOW).ok).toBe(false);
    expect(validateSuspendUntil("不是日期", NOW).ok).toBe(false);
  });
  it("R11 已有生效中的停權 → 不能重複停權", () => {
    expect(checkNotAlreadySuspended({ until: null }, NOW)).toEqual({
      ok: false,
      message: "此帳號已在停權中，請先解除停權再重新停權",
    });
    expect(checkNotAlreadySuspended({ until: "2026-11-04" }, NOW).ok).toBe(false);
  });
  it("R11 沒有停權、或停權已到期 → 可以停權", () => {
    expect(checkNotAlreadySuspended(null, NOW)).toEqual({ ok: true });
    expect(checkNotAlreadySuspended({ until: "2026-10-27" }, NOW)).toEqual({ ok: true });
  });
});

describe("影響說明與提示（UT-HQ-22～24）", () => {
  it("UT-HQ-22 審核中申請 3 筆", () => {
    expect(getImpactMessage(3)).toBe("將自動婉拒 3 筆審核中申請並通知對方");
  });
  it("UT-HQ-23 0 筆（或負數、非數字）不顯示", () => {
    expect(getImpactMessage(0)).toBeNull();
    expect(getImpactMessage(-1)).toBeNull();
    expect(getImpactMessage(Number.NaN)).toBeNull();
  });
  it("UT-HQ-24 解除停權提示", () => {
    expect(UNSUSPEND_NOTICE).toBe("已婉拒的申請不會恢復");
  });
});

describe("黑名單 Email 確認（UT-HQ-25、26）", () => {
  it("UT-HQ-25 去空白、不分大小寫後相符", () => {
    expect(confirmBanEmail(" User@Example.com ", "user@example.com")).toEqual({ ok: true });
  });
  it("帳號 Email 本身大小寫不同也相符", () => {
    expect(confirmBanEmail("user@example.com", " USER@example.com ")).toEqual({ ok: true });
  });
  it("UT-HQ-26 不符 → Email 與此帳號不符", () => {
    expect(confirmBanEmail("other@example.com", "user@example.com")).toEqual({
      ok: false,
      message: "Email 與此帳號不符",
    });
  });
  it("未輸入或帳號沒有 Email → 不可儲存", () => {
    expect(confirmBanEmail("", "user@example.com").ok).toBe(false);
    expect(confirmBanEmail("   ", "user@example.com").ok).toBe(false);
    expect(confirmBanEmail("a@b.c", "").ok).toBe(false);
    expect(confirmBanEmail("a@b.c", null).ok).toBe(false);
  });
});

describe("快選原因（UT-HQ-27、28）", () => {
  it("UT-HQ-27 快選「詐騙」＋補充文字 → 「詐騙：補充文字」", () => {
    expect(composeReason("詐騙", "補充文字")).toBe("詐騙：補充文字");
  });
  it("只有快選或只有文字、兩者皆空", () => {
    expect(composeReason("詐騙", "  ")).toBe("詐騙");
    expect(composeReason(null, " 自己寫的 ")).toBe("自己寫的");
    expect(composeReason("詐騙", undefined)).toBe("詐騙");
    expect(composeReason(null, "")).toBe("");
  });
  it("UT-HQ-28 各處置的快選原因符合規格書 §4.7", () => {
    expect(getQuickReasons("suspend")).toEqual(["疑似販售貓咪", "詐騙", "辱罵或騷擾", "不實資料", "其他"]);
    expect(getQuickReasons("takedown")).toEqual(["非貓內容", "不當內容", "重複", "其他"]);
    expect(getQuickReasons("revoke_grant")).toEqual(["職務異動", "資料不符", "其他"]);
    expect(getQuickReasons("revoke_badge")).toEqual(["職務異動", "資料不符", "其他"]);
  });
  it("規格書未列的處置回傳空清單，且與 QUICK_REASONS 一致", () => {
    for (const d of ["unsuspend", "relist", "ban", "unban"] as const) expect(getQuickReasons(d)).toEqual([]);
    for (const d of HQ_DISPOSITIONS) expect(getQuickReasons(d)).toEqual(QUICK_REASONS[d]);
  });
});
