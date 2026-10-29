"use client";
/* eslint-disable @next/next/no-img-element */
// 網站設定（規格書 §4.3；取代舊後台的外觀設定）：Logo（內建 3 款或上傳）、Demo 加速模式。寫入一律走 meow_set_site_setting。
import { useCallback, useEffect, useState } from "react";
import { useUi } from "@/components/Providers";
import { useHqActor } from "@/components/hq/HqActor";
import { HqSaveButton } from "@/components/hq/HqStates";
import { useHqToast } from "@/components/hq/HqToast";
import { composeReason } from "@/lib/hq/actions";
import { ADMIN_QUICK_REASONS, LOGO_TYPES, logoStoragePath, validateLogoFile } from "@/lib/hq/admin-auth";
import { LOGOS } from "@/lib/mock-data";
import { resolveSiteLogo } from "@/lib/site-logo";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ReasonField } from "./ReasonField";

const BUCKET = "meow-site-assets";
const LOG = "/MeowHQ/admin?tab=audit";

export function SettingsTab() {
  const { preview } = useHqActor();
  const { logo, applyLogo } = useUi();
  const toast = useHqToast();
  const [uploads, setUploads] = useState<string[]>([]);
  const [pick, setPick] = useState<string>(logo.kind === "upload" ? logo.src : logo.id);
  const [demo, setDemo] = useState<boolean | null>(null);
  const [demoDraft, setDemoDraft] = useState(false);
  const [logoReason, setLogoReason] = useState({ quick: "", extra: "" });
  const [demoReason, setDemoReason] = useState({ quick: "", extra: "" });
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const current = logo.kind === "upload" ? logo.src : logo.id;
  useEffect(() => setPick(current), [current]);

  const loadUploads = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (preview || !sb) return;
    const { data } = await sb.storage.from(BUCKET).list("logos", { limit: 50, sortBy: { column: "created_at", order: "desc" } });
    setUploads((data ?? []).filter(f => f.id).map(f => sb.storage.from(BUCKET).getPublicUrl(`logos/${f.name}`).data.publicUrl));
  }, [preview]);

  useEffect(() => {
    void loadUploads();
    const sb = getBrowserSupabase();
    if (preview || !sb) { setDemo(false); return; }
    sb.from("meow_site_settings").select("value").eq("key", "demo_speed").maybeSingle().then(({ data }) => {
      const v = data?.value === true;
      setDemo(v); setDemoDraft(v);
    });
  }, [loadUploads, preview]);

  async function upload(file: File) {
    setUploadMsg(null);
    const check = validateLogoFile(file);
    if (!check.ok) { setUploadMsg(check.message); return; }
    const sb = getBrowserSupabase();
    if (!sb) { setUploadMsg("預覽模式不能上傳"); return; }
    setUploading(true);
    const path = logoStoragePath(file.name, new Date());
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) { setUploadMsg("上傳失敗，請確認是系統管理員並稍後再試"); return; }
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    setUploads(u => [url, ...u]);
    setPick(url);
    setUploadMsg("已上傳，填寫原因後按「套用 Logo」");
  }

  async function save(key: "logo" | "demo_speed", value: string | boolean, r: { quick: string; extra: string }) {
    const reason = composeReason(r.quick, r.extra);
    if (!reason) throw { hint: "請填寫原因" };
    const sb = getBrowserSupabase();
    if (!sb) throw { hint: "預覽模式不能儲存" };
    const { error } = await sb.rpc("meow_set_site_setting", { p_key: key, p_value: value, p_reason: reason });
    if (error) throw error;
    if (key === "logo") {
      applyLogo(value); setLogoReason({ quick: "", extra: "" });
      toast.show({ message: `已套用「${resolveSiteLogo(value).name}」`, logHref: LOG });
    } else {
      setDemo(value as boolean); setDemoReason({ quick: "", extra: "" });
      toast.show({ message: `Demo 加速模式已${value ? "開啟" : "關閉"}`, logHref: LOG });
    }
  }

  const options = [
    ...LOGOS.map(l => ({ value: l.id, src: l.src, name: l.name })),
    ...uploads.map((u, i) => ({ value: u, src: u, name: `上傳 ${uploads.length - i}` })),
  ];

  return (
    <>
      <section className="hq-section" aria-label="網站外觀">
        <h2>網站外觀 Logo</h2>
        <div className="hq-box">
          <div className="hq-row">
            <img src={logo.src} alt="目前的 Logo" className="hq-logo-now" />
            <span className="hq-hint">目前使用：{logo.name}</span>
          </div>
          <div className="hq-logo-grid" role="radiogroup" aria-label="選擇 Logo">
            {options.map(o => (
              <label key={o.value} className={`hq-logo-pick${pick === o.value ? " on" : ""}`}>
                <input type="radio" name="logo" checked={pick === o.value} onChange={() => setPick(o.value)} />
                <img src={o.src} alt="" />
                <span>{o.name}{o.value === current ? "（使用中）" : ""}</span>
              </label>
            ))}
          </div>
          <label className="hq-btn ghost">
            {uploading ? "上傳中…" : "上傳新 Logo"}
            <input type="file" accept={LOGO_TYPES.join(",")} hidden disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </label>
          <p className="hq-hint">PNG、JPG、SVG、WebP，1 MB 以內。</p>
          {uploadMsg && <p className="hq-note" role="status">{uploadMsg}</p>}
          {pick !== current && (
            <>
              <ReasonField quick={ADMIN_QUICK_REASONS.setting} value={logoReason} onChange={setLogoReason} />
              <HqSaveButton onSave={() => save("logo", pick, logoReason)}>套用 Logo</HqSaveButton>
            </>
          )}
        </div>
      </section>

      <section className="hq-section" aria-label="Demo 加速模式">
        <h2>Demo 加速模式</h2>
        <div className="hq-box">
          <label className="hq-check">
            <input type="checkbox" checked={demoDraft} disabled={demo === null} onChange={e => setDemoDraft(e.target.checked)} />
            開啟後，展示時可縮短等待（例如虛擬試養的天數）
          </label>
          {demo !== null && demoDraft !== demo && (
            <>
              <ReasonField quick={ADMIN_QUICK_REASONS.setting} value={demoReason} onChange={setDemoReason} />
              <HqSaveButton onSave={() => save("demo_speed", demoDraft, demoReason)}>儲存</HqSaveButton>
            </>
          )}
        </div>
      </section>
    </>
  );
}
