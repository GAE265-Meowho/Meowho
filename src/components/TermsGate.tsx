"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { canAgreeTerms, hasReadToEnd } from "@/lib/terms";

/** 首次登入條款同意：條款全文在捲動框內，讀到最下方才能勾選，勾選後才能同意（Issue #16） */
export function TermsGate({ onAgree }: { onAgree: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/legal")
      .then(r => (r.ok ? r.json() : { text: "" }))
      .then((d: { text?: string }) => setText(d.text || ""))
      .catch(() => setText(""));
  }, []);

  const checkRead = useCallback(() => {
    const el = boxRef.current;
    if (el && hasReadToEnd(el)) setRead(true);
  }, []);

  // 條款載入後檢查一次：內容短到不需要捲動時直接算已讀
  useEffect(() => { if (text) checkRead(); }, [text, checkRead]);

  const failed = text === "";
  return (
    <section className="profile-card">
      <h2>開始之前</h2>
      <p className="sub">請閱讀並同意 Meow Home 的隱私權政策與服務條款。我們只會公開貓戶到「縣市＋區」，你上傳的照片和文字會交給 AI 服務整理成貓咪名片。</p>
      <div ref={boxRef} className="terms-box" onScroll={checkRead} tabIndex={0} role="region" aria-label="隱私權政策與服務條款全文">
        {text === null ? "條款載入中…" : failed ? "條款載入失敗，請重新整理頁面。" : text}
      </div>
      {!read && !failed && <p className="sub terms-hint" aria-live="polite">請捲到最下方，看完條款後才能勾選。</p>}
      <label className="check">
        <input type="checkbox" checked={checked} disabled={!read} onChange={e => setChecked(e.target.checked)} />
        我已閱讀並同意隱私權政策與服務條款
      </label>
      <button className="btn block" disabled={!canAgreeTerms({ read, checked })} onClick={onAgree}>同意並繼續</button>
      <p className="sub"><Link href="/legal" target="_blank">另開完整頁面閱讀</Link></p>
    </section>
  );
}
